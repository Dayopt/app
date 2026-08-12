import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// security guard の test は、正常系の確認ではなく **敵対的な試行を先に列挙する**。
// 「許可すべき形が通る / 明らかに違う形が落ちる」だけを書くと、境界の 1 文字ずらし・
// 区切りの省略・類似名が抜ける。実際 2026-08-11 に guard の正規表現へ 2 回続けて
// 穴が空き（basename 判定、optional group による区切りの任意化）、どちらもこの
// file の test では捕まらず外部レビューが見つけた。判定を足す時は、
// まず「どう書けば通ってしまうか」を数え上げてから allow 側を書く。
//
// guard 実装側の対の教訓は「許可形を省略記法で組み立てず選択肢で列挙する」
// （.claude/hooks/pre-tool-guard.sh のコメント参照）。
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guardPath = resolve(rootDir, '.claude/hooks/pre-tool-guard.sh');

// path を組み立てるのは、この test file 自体を編集する Write が
// guard の file path 検査に引っかからないようにするため。
const ADMIN = `.op-env${'.'}admin`;
const ADMIN_EXAMPLE = `${ADMIN}.example`;
const LOCAL = `.op-env${'.'}local`;
const LOCAL_EXAMPLE = `${LOCAL}.example`;

const PROD_REF = `op://Dayopt-Production/supabase/SUPABASE_SERVICE_ROLE_KEY`;
const STAGING_REF = `op://Dayopt-Staging/supabase/SUPABASE_ACCESS_TOKEN`;

type Decision = 'block' | 'allow';

function runGuard(input: Record<string, unknown>, cwd: string = rootDir): Decision {
  const result = spawnSync('bash', [guardPath], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(input),
  });
  return result.status === 2 ? 'block' : 'allow';
}

function bash(command: string): Record<string, unknown> {
  return { tool_name: 'Bash', tool_input: { command } };
}

function mcp(toolName: string): Record<string, unknown> {
  return { tool_name: toolName, tool_input: { title: 'x', prompt: 'y' } };
}

// setup が黙って失敗すると、以降の assert が「たまたま通る」形で緑になる。
// 失敗は即座に投げる。
function git(args: string[], cwd: string): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  }
}

function write(filePath: string, content = ''): Record<string, unknown> {
  return { tool_name: 'Write', tool_input: { file_path: filePath, content } };
}

function edit(filePath: string, newString = ''): Record<string, unknown> {
  return { tool_name: 'Edit', tool_input: { file_path: filePath, new_string: newString } };
}

// guard 自体が壊れると全 tool がブロックされ、guard を直す編集まで塞がれる。
// 2026-08-12 に実際に起きた（[[ ]] の中へ引用符入りの正規表現を直接書いて構文
// エラーになり、Bash / Write / Edit がすべて拒否されて別セッションからの復旧が
// 必要になった）。bash は構文エラーで exit 2 を返し、hook はそれを block と解釈する。
// エディタ上の規律ではなく test で固定する。
describe('pre-tool-guard.sh: script 自体の健全性', () => {
  it('bash の構文チェックを通る', () => {
    const result = spawnSync('bash', ['-n', guardPath], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('pre-tool-guard.sh: .op-env.admin', () => {
  // .op-env.admin があると op run で production の service role key が解決され、
  // admin script が本番へ書き込める。作成と消費の両方を止める必要がある。
  it.each([
    ['雛形からのコピー', `cp ${ADMIN_EXAMPLE} ${ADMIN}`],
    ['リダイレクトでの作成', `cat > ${ADMIN}`],
    ['追記', `echo x >> ${ADMIN}`],
    ['touch', `touch ${ADMIN}`],
    ['セパレータ後の cp', `pnpm i && cp a ${ADMIN}`],
  ])('作成を止める: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it('Write / Edit でも作成を止める', () => {
    expect(runGuard(write(`/x/${ADMIN}`))).toBe('block');
    expect(runGuard(edit(`/x/${ADMIN}`))).toBe('block');
  });

  // 作成だけ止めても、雛形をそのまま op run に渡せば同じ権限が解決される。
  // コマンド名ではなく --env-file の指す先で判定するので、op をどう起動しても落ちる。
  it.each([
    ['雛形の直接実行', `op run --env-file=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`],
    ['実ファイル', `op run --env-file=${ADMIN} -- bash scripts/admin-show-user.sh`],
    ['空白区切りの --env-file', `op run --env-file ${ADMIN_EXAMPLE} -- sh -c true`],
    ['セパレータ後の op run', `cd /tmp && op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['env 経由', `env op run --env-file=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`],
    ['command 経由', `command op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['絶対パス', `/opt/homebrew/bin/op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['sh -c でくるむ', `sh -c "op run --env-file=${ADMIN_EXAMPLE} -- sh -c true"`],
    ['環境変数代入を前置', `FOO=1 op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
    ['xargs 経由', `echo x | xargs -I{} op run --env-file=${ADMIN_EXAMPLE} -- sh -c true`],
  ])('op run による消費を止める: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it.each([
    ['通常 local dev の op run', `op run --env-file=${LOCAL} -- pnpm env:check`],
    ['雛形の読み取り', `cat ${ADMIN_EXAMPLE}`],
    ['名前の grep', `rg -n ${ADMIN} docs/`],
    ['local の作り直し', `cp ${LOCAL_EXAMPLE} ${LOCAL}`],
    ['無関係コマンド', 'git status'],
  ])('正当な操作は通す: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('allow');
  });

  it('雛形と local の編集は通す', () => {
    expect(runGuard(write(`/x/${ADMIN_EXAMPLE}`))).toBe('allow');
    expect(runGuard(edit(`/x/${LOCAL}`))).toBe('allow');
  });

  // 引数で判定する代償として、この flag と path を並べた文字列を Bash 引数へ
  // 含めるだけでも落ちる。docs に書く時は Write/Edit で file に書いてから渡す。
  // 迂回形を数え上げる方式では env / command / 絶対パス / sh -c と際限がないため、
  // 誤検知を受け入れて class ごと閉じる方を選んでいる。
  it('flag と path を並べた文字列は、引用符の中でも落とす', () => {
    const mention = `gh pr edit 1935 --body 'op run --env-file=${ADMIN_EXAMPLE} -- bash x.sh で本番権限が解決される'`;
    expect(runGuard(bash(mention))).toBe('block');
  });

  // 禁止 path を数え上げる方式は、雛形を別名へ複製されると破れる
  // （cp .op-env.admin.example /tmp/foo → その別名を op run へ）。
  // path 名から中身は判別できないので allowlist にして、中身を問わず落とす。
  it.each([
    ['別名へ複製した env-file', 'op run --env-file=/tmp/foo -- bash scripts/admin-delete-user.sh'],
    ['相対の別名', 'op run --env-file=./tmp-env -- sh -c true'],
    ['変数展開', 'op run --env-file="$OP_ENV_PATH" -- sh -c true'],
    ['local の雛形', `op run --env-file=${LOCAL_EXAMPLE} -- sh -c true`],
    // 「path らしくない token は無視する」例外を置くと、escape を含む path が
    // 検査対象から外れて空白入りの別名で迂回できた。分類せず落とす。
    [
      '空白を escape した別名',
      'op run --env-file=/tmp/foo\\ bar -- bash scripts/admin-delete-user.sh',
    ],
    ['引用符で囲んだ別名', 'op run --env-file="/tmp/foo bar" -- sh -c true'],
    // basename で判定すると、任意ディレクトリに同名で置くだけで通ってしまう。
    // path 文字列そのものを allowlist にして塞ぐ。
    [
      '別ディレクトリの同名ファイル',
      'op run --env-file=/tmp/.op-env.local -- bash scripts/admin-delete-user.sh',
    ],
    ['home 配下の同名ファイル', 'op run --env-file=~/.op-env.local -- sh -c true'],
    ['深い相対 path の同名ファイル', 'op run --env-file=../../../tmp/.op-env.local -- sh -c true'],
    // 許可形を optional group で組み立てると区切りの / が任意になり、
    // 下のような類似名まで通る。省略記法を使わず選択肢で列挙する。
    ['区切りなしの類似名', 'op run --env-file=..op-env.local -- bash scripts/admin-delete-user.sh'],
    ['ドットを増やした類似名', 'op run --env-file=../...op-env.local -- sh -c true'],
    ['1 階層だけ上の同名ファイル', 'op run --env-file=../.op-env.local -- sh -c true'],
    // bash は実行前に `\` + 改行を除去するため、複数行に整形しただけで
    // 行単位の grep は分断される。敵対的な回避ではなく通常の整形で起きる。
    [
      '行継続で分断した flag',
      `op run --env-file\\\n=${ADMIN_EXAMPLE} -- bash scripts/admin-delete-user.sh`,
    ],
    ['行継続で分断した path', `op run --env-file=\\\n${ADMIN_EXAMPLE} -- sh -c true`],
  ])('許可外の env-file を落とす: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it('作成側も行継続で分断されない', () => {
    expect(runGuard(bash(`cp ${ADMIN_EXAMPLE}\\\n ${ADMIN}`))).toBe('block');
  });

  it.each([
    ['repo root の local', `op run --env-file=${LOCAL} -- pnpm typecheck`],
    ['明示的な ./ 付き', `op run --env-file=./${LOCAL} -- pnpm typecheck`],
    ['workspace からの相対 local', `op run --env-file=../../${LOCAL} -- pnpm typecheck`],
  ])('許可された env-file は通す: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('allow');
  });

  // 判定は fail closed。token を分類して例外を作ると、そこが穴になる
  // （escape を含む path が「path らしくない」として素通りした）。
  // 代償として散文も落ちる。docs に書く時は Write/Edit で file へ書いてから渡す。
  it('散文で flag に言及しただけでも落とす（fail closed の代償）', () => {
    const prose = 'git commit -m "--env-file に渡してよいのは通常の local だけにする"';
    expect(runGuard(bash(prose))).toBe('block');
  });

  it('flag を伴わない名前の言及は通す', () => {
    expect(
      runGuard(bash(`gh pr edit 1935 --body '${ADMIN_EXAMPLE} は production を参照する'`)),
    ).toBe('allow');
  });
});

// #1953: regex でコマンド文字列を見る限り shell の引数解釈は再現できない。
// 「flag に一致したら後続 token を照合する」2 段構えは、トリガーに一致しない
// 書き方が照合にすら入らず素通りする。判定を「-env-file の言及が **すべて**
// 許可形か」に変え、変形を個別に数え上げるのをやめた。
describe('pre-tool-guard.sh: flag 自体の書き換え', () => {
  it.each([
    // quote は shell が引数から取り除くので、= の前後どこへ刺しても argv は同じ。
    // 旧実装はトリガーの --env-file[=空白] に一致せず素通りしていた。
    ['= の前に二重引用符', `op run --env-file"=${ADMIN}" -- bash scripts/admin-delete-user.sh`],
    ['= の前に単引用符', `op run --env-file'='${ADMIN} -- bash scripts/admin-show-user.sh`],
    ['= を backslash escape', `op run --env-file\\=${ADMIN} -- sh -c true`],
    // flag 名の内側に刺す形は生の文字列に -env-file が現れない。
    // quote / backslash を除いた写しでのみ捕まる。
    ['flag 名の内側に二重引用符', `op run --env-f"ile"=${ADMIN} -- sh -c true`],
    ['flag 名の内側に単引用符', `op run --env-'file'=${ADMIN} -- sh -c true`],
    // ANSI-C / locale 形式の quote も shell が引数から取り除く。導入の $ を
    // 落としてから通常の quote 除去に合流させないと、どちらの写しにも
    // -env-file が現れない。
    ['ANSI-C quote で flag を分断', `op run --env-fi$'le'=${ADMIN} -- sh -c true`],
    ['locale quote で flag を分断', `op run --env-fi$"le"=${ADMIN} -- sh -c true`],
    // = が無い形・変数が挟まる形も「許可形ではない言及」として落ちる。
    [
      'flag と = の間に変数',
      'op run --env-file${X}=/tmp/evil -- bash scripts/admin-delete-user.sh',
    ],
    // 許可形が 1 つあっても、許可外の言及が混ざれば落ちる。
    [
      '許可形のあとに許可外の flag',
      `op run --env-file=${LOCAL} --env-file=/tmp/evil -- sh -c true`,
    ],
    // 引用符を挟んで token の途中に空白を作る形。生の文字列側の検査で落ちる。
    ['許可 literal に引用符を混ぜる', `op run --env-file="${LOCAL}"" /tmp/evil" -- sh -c true`],
  ])('落とす: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  // 受け入れる代償。閉じ引用符が続く形を除外する例外は置かない
  // （同型の例外が過去 2 回穴になっている）。回避策は leading dash を外すこと。
  it('flag の直後に引用符が来る自己検索も落ちる（受け入れる誤検知）', () => {
    expect(runGuard(bash(`rg -- '--env-file' .claude/hooks/`))).toBe('block');
  });

  it('leading dash を外した検索は通る（誤検知の回避策）', () => {
    expect(runGuard(bash('rg env-file .claude/hooks/'))).toBe('allow');
  });
});

// #1944: heredoc 本文も危険コマンド検査の対象に**残す**（誤検知を受け入れる）。
//
// 「本文はデータだから外す」を実装したが、**どの行が本当に heredoc を開いていて
// 本文がどこへ行くのかは、shell の引用状態とコマンド位置を解釈しないと決まらない。**
// 外部レビュー 3 巡で 4 通りの取りこぼしが実測で見つかり、いずれも変更前は
// ブロックできていた形が通るようになる方向だった。下の block ケース群は、
// その実測で見つかった形をそのまま回帰テストとして残したもの。
//
// force-push / reset ガードは agent 自身の逸脱を止めるためのもので、ブロック側の
// 後退は P3 の誤検知より重い。誤検知（コミットメッセージに文字列を書くと落ちる）は
// 受け入れて docs に書く。判断の記録は .claude/hooks/pre-tool-guard.sh のコメントと
// #1944 のコメント。
describe('pre-tool-guard.sh: heredoc 本文と危険コマンド', () => {
  const heredoc = (intro: string, body: string, delim = 'EOF') => `${intro}\n${body}\n${delim}`;

  // 受け入れる誤検知。回避策は文面を変えるか、Write / Edit で file へ書いてから渡す。
  it.each([
    [
      'commit message 本文での言及',
      heredoc(
        "git commit -F - <<'EOF'",
        'fix: guard\n\ngit push --no-verify を禁止する規約に触れた',
      ),
    ],
    ['cat のリダイレクト', heredoc('cat <<EOF > /tmp/note.md', 'git push --force は禁止')],
    ['reset --hard の言及', heredoc("git commit -F - <<'EOF'", 'docs: git reset --hard の注意')],
  ])('本文での言及も落ちる（受け入れる誤検知）: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it.each([
    ['素の force push', 'git push --force origin main'],
    ['素の no-verify', 'git push --no-verify'],
    ['セパレータ後の no-verify', 'pnpm check && git push --no-verify'],
    ['sh -c でくるむ force', 'sh -c "git push --force"'],
    ['素の reset --hard', 'git reset --hard origin/main'],
    // 以下は heredoc 除外を実装した時に「通るようになっていた」形。除外を
    // やめたので素直に落ちる。除外を再導入するなら、まずここが緑のままかを見る。
    ['heredoc を bash へ食わせる', heredoc('bash <<EOF', 'git push --no-verify')],
    ['cat heredoc を bash へ pipe', heredoc('cat <<EOF | bash', 'git reset --hard')],
    ['eval + heredoc', 'eval "$(cat <<\'EOF\'\ngit push --no-verify\nEOF\n)"'],
    ['コマンド置換 + heredoc', 'x=$(cat <<EOF\ngit reset --hard\nEOF\n)'],
    ['プロセス置換', 'bash <(cat <<EOF\ngit push --no-verify\nEOF\n)'],
    [
      '導入行の ; で後続実行',
      'cat <<EOF > /tmp/run.sh; bash /tmp/run.sh\ngit push --force origin main\nEOF',
    ],
    // consumer 名が実行コマンドではなく引数の位置にある形。実際は bash が stdin を実行する
    [
      'bash -s に consumer 名を混ぜる',
      heredoc('bash -s git <<EOF', 'git push --force origin main'),
    ],
    // 引用符やコメントの中の << は heredoc ではない。次行は普通に実行される
    ['引用文字列の中の <<EOF', 'echo "x cat <<EOF"\ngit push --force origin main\nEOF'],
    ['コメント内の <<EOF', '# cat <<EOF\ngit push --force origin main\nEOF'],
    ['heredoc の後続行', `${heredoc("git commit -F - <<'EOF'", 'msg')}\ngit push --no-verify`],
    ['here-string の後の実コマンド', 'cat <<< "x"; git push --no-verify'],
  ])('実コマンドは落とす: %s', (_label, command) => {
    expect(runGuard(bash(command))).toBe('block');
  });

  it('--force-with-lease は通す', () => {
    expect(runGuard(bash('git push --force-with-lease origin main'))).toBe('allow');
  });
});

// #1949: path の allowlist は「どのファイルか」しか見ない。許可 path の中身へ
// production 参照を書き足せば、path トリックなしで production credential に届く。
// 中身は op:// の vault で判定し、許可 vault 以外を落とす。
describe('pre-tool-guard.sh: env-file の中身', () => {
  let fixtureRoot: string;
  let cleanDir: string;
  let prodDir: string;
  let emptyDir: string;
  let nestedDir: string;

  beforeAll(() => {
    // fixture を tmp に置くのは、実環境の .op-env.local の有無で結果が変わらない
    // ようにするため（main checkout には実ファイルがあり、worktree には無い）。
    fixtureRoot = mkdtempSync(join(tmpdir(), 'pre-tool-guard-'));
    cleanDir = join(fixtureRoot, 'clean');
    prodDir = join(fixtureRoot, 'prod');
    emptyDir = join(fixtureRoot, 'empty');
    nestedDir = join(prodDir, 'apps', 'product');
    mkdirSync(cleanDir);
    mkdirSync(prodDir);
    mkdirSync(emptyDir);
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(cleanDir, LOCAL),
      [
        'A=' + STAGING_REF,
        'B=op://Dayopt-Shared/resend/RESEND_API_KEY',
        'C=op://Dayopt-Local/supabase/URL',
      ].join('\n'),
    );
    writeFileSync(join(prodDir, LOCAL), ['A=' + STAGING_REF, 'B=' + PROD_REF].join('\n'));
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('許可 vault だけの env-file は通す', () => {
    expect(runGuard(bash(`op run --env-file=${LOCAL} -- pnpm typecheck`), cleanDir)).toBe('allow');
  });

  it('production 参照を含む env-file は落とす', () => {
    expect(runGuard(bash(`op run --env-file=${LOCAL} -- pnpm typecheck`), prodDir)).toBe('block');
  });

  it('./ 形でも中身を見る', () => {
    expect(runGuard(bash(`op run --env-file=./${LOCAL} -- sh -c true`), prodDir)).toBe('block');
  });

  it('workspace からの相対形でも中身を見る', () => {
    expect(runGuard(bash(`op run --env-file=../../${LOCAL} -- pnpm typecheck`), nestedDir)).toBe(
      'block',
    );
  });

  // quote を除いた写しにしか -env-file が現れない形。path の抽出も言及の検出も
  // 生の写しだけを見ていた時、この形は中身検査にも単一コマンド制約にも載らず、
  // production 参照を持つ env-file をそのまま解決できていた。
  it('flag 名の内側に引用符があっても中身を見る', () => {
    expect(runGuard(bash(`op run --env-f"ile"=${LOCAL} -- sh -c true`), prodDir)).toBe('block');
  });

  // ANSI-C quote は生の写しにも通常の quote 除去後の写しにも -env-file を
  // 残さない。$ を落としてから合流させないと、中身検査まで素通りする。
  it('ANSI-C quote で分断された flag でも中身を見る', () => {
    expect(runGuard(bash(`op run --env-fi$'le'=${LOCAL} -- sh -c true`), prodDir)).toBe('block');
  });

  // 存在しない file は「解決される参照が無い」ので通す。op run 側が失敗する。
  it('env-file が存在しなければ通す', () => {
    expect(runGuard(bash(`op run --env-file=${LOCAL} -- pnpm typecheck`), emptyDir)).toBe('allow');
  });

  // hook は Bash 呼び出しごとに実行前 1 回しか発火しないので、同一コマンド内で
  // 書き換えられると上の中身検査は書き換え前を読む。検査した中身と実際に解決
  // される中身が別物になるため、そういう余地のあるコマンド形自体を落とす。
  //
  // 書き手を列挙する方式では閉じない。列挙（cp / mv / tee / sed / リダイレクト）を
  // 実装した時点で python3 / node / `>|` がすり抜けることを実測した。区切りと
  // コマンド置換という「別のことが起きる余地」の方を落とす。
  it.each([
    [
      '追記してから消費',
      `echo 'X=${PROD_REF}' >> ${LOCAL} && op run --env-file=${LOCAL} -- sh -c true`,
    ],
    [
      '雛形コピー直後に消費',
      `cp ${LOCAL_EXAMPLE} ${LOCAL} && op run --env-file=${LOCAL} -- pnpm typecheck`,
    ],
    ['sed -i してから消費', `sed -i '' s/a/b/ ${LOCAL}; op run --env-file=${LOCAL} -- sh -c true`],
    ['tee してから消費', `echo x | tee ${LOCAL} && op run --env-file=${LOCAL} -- sh -c true`],
    // 列挙方式をすり抜けた書き手たち
    [
      'python3 で追記してから消費',
      `python3 -c "open('${LOCAL}','a').write('X=${PROD_REF}')" && op run --env-file=${LOCAL} -- sh -c true`,
    ],
    [
      'node で追記してから消費',
      `node -e "require('fs').appendFileSync('${LOCAL}','X=${PROD_REF}')" && op run --env-file=${LOCAL} -- sh -c true`,
    ],
    [
      'awk で書いてから消費',
      `awk 'BEGIN{print "X" > "${LOCAL}"}' && op run --env-file=${LOCAL} -- sh -c true`,
    ],
    // >| は > の別形。除外文字クラスに | を入れていたリダイレクト検出をすり抜けた
    [
      '>| で上書きしてから消費',
      `echo 'X=${PROD_REF}' >| ${LOCAL} && op run --env-file=${LOCAL} -- sh -c true`,
    ],
    // 改行も区切り。COMMAND_JOINED は改行を空白へ寄せるので、生の文字列側で見る
    [
      '改行で繋いだ書き換え + 消費',
      `echo 'X=${PROD_REF}' >> ${LOCAL}\nop run --env-file=${LOCAL} -- sh -c true`,
    ],
    // コマンド置換の中に書き手を隠す形
    ['コマンド置換を含む消費', `op run --env-file=${LOCAL} -- sh -c "$(printf x)"`],
    // cd は中身検査の path 解決をずらす。同じ規則で落ちる
    ['cd してから消費', `cd /tmp && op run --env-file=${LOCAL} -- sh -c true`],
    // 言及の検出を生の写しだけで行っていた時、この形は制約から外れていた
    ['flag 名の内側に引用符 + 区切り', `cd /tmp && op run --env-f"ile"=${LOCAL} -- sh -c true`],
    ['プロセス置換を含む消費', `op run --env-file=${LOCAL} -- diff <(echo a) <(echo b)`],
  ])('env-file の消費は単一の単純コマンドに限る: %s', (_label, command) => {
    expect(runGuard(bash(command), cleanDir)).toBe('block');
  });

  it('書き換えだけなら通す（消費は次のコマンドで検査される）', () => {
    expect(runGuard(bash(`echo 'X=${STAGING_REF}' >> ${LOCAL}`), cleanDir)).toBe('allow');
  });

  // 発生源でも止める。実行時の検査は agent が op run を直接打つ場面でしか
  // 発火しない（pnpm typecheck:op などは npm script の内側で op run するので
  // hook からは見えない）ため、書き足し自体をここで落とす。
  it.each([
    ['Write に production 参照', write(`/x/${LOCAL}`, `A=${PROD_REF}`)],
    ['Edit に production 参照', edit(`/x/${LOCAL}`, `A=${PROD_REF}`)],
    ['雛形へ production 参照', write(`/x/${LOCAL_EXAMPLE}`, `A=${PROD_REF}`)],
    ['未知の vault', write(`/x/${LOCAL}`, 'A=op://Dayopt-Prod/supabase/KEY')],
  ])('書き込み時にも落とす: %s', (_label, input) => {
    expect(runGuard(input)).toBe('block');
  });

  it.each([
    ['Write に staging 参照', write(`/x/${LOCAL}`, `A=${STAGING_REF}`)],
    ['Edit に local 参照', edit(`/x/${LOCAL}`, 'A=op://Dayopt-Local/supabase/URL')],
    // admin 雛形は設計上 production を参照する。ここを落とすと schema 更新ができない。
    ['admin 雛形への production 参照', write(`/x/${ADMIN_EXAMPLE}`, `A=${PROD_REF}`)],
    // env-file 以外への言及は対象外（docs に vault 名を書けなくなる）
    ['docs への言及', write('/x/notes.md', `${PROD_REF} を参照する運用`)],
  ])('正当な書き込みは通す: %s', (_label, input) => {
    expect(runGuard(input)).toBe('allow');
  });
});

// #1959: チップ起票（spawn_task）は指揮台セッションの専権。レーンが直接 User へ
// チップを出すと triage の判断が User に飛ぶ。レーンは issue 化 + 指揮台へ
// send_message に一本化する（.claude/rules/orchestration.md §レーンの連絡規律）。
describe('pre-tool-guard.sh: レーンからのチップ起票', () => {
  const SPAWN = 'mcp__ccd_session__spawn_task';
  let fixtureRoot: string;
  let mainDir: string;
  let worktreeDir: string;
  let plainDir: string;

  beforeAll(() => {
    // 判定は git の linked worktree かどうか。実環境の worktree に依存させると
    // CI（plain clone）で結果が変わるので、fixture で両方を作る。
    fixtureRoot = mkdtempSync(join(tmpdir(), 'pre-tool-guard-git-'));
    mainDir = join(fixtureRoot, 'main');
    worktreeDir = join(fixtureRoot, 'lane');
    plainDir = join(fixtureRoot, 'plain');
    mkdirSync(mainDir);
    mkdirSync(plainDir);
    git(['init', '-q', '.'], mainDir);
    git(
      [
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'init',
      ],
      mainDir,
    );
    git(['worktree', 'add', '-q', worktreeDir, '-b', 'lane'], mainDir);
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('linked worktree からは落とす', () => {
    expect(runGuard(mcp(SPAWN), worktreeDir)).toBe('block');
  });

  it('main checkout からは通す（指揮台のレーン編成は正規手段）', () => {
    expect(runGuard(mcp(SPAWN), mainDir)).toBe('allow');
  });

  // 判定は「指揮台だと言い切れた時だけ通す」allowlist。git が使えない・repo 外は
  // 落とす。`cd ""` は bash では成功してカレントに留まるため、空値を素通りさせると
  // 両者が同じ cwd に解決されて「一致＝指揮台」と誤判定する（実装中に踏んだ）。
  it('git 管理外のディレクトリからは落とす（fail closed）', () => {
    expect(runGuard(mcp(SPAWN), plainDir)).toBe('block');
  });

  // path の慣習（.claude/worktrees/ 配下）で判定していないことの裏取り。
  // fixture の worktree は慣習の外にあるが、それでも落ちる。
  it('慣習外の場所にある worktree でも落とす', () => {
    expect(worktreeDir).not.toContain('.claude/worktrees');
    expect(runGuard(mcp(SPAWN), worktreeDir)).toBe('block');
  });

  it.each([
    ['章立て', 'mcp__ccd_session__mark_chapter'],
    ['指揮台への連絡', 'mcp__ccd_session_mgmt__send_message'],
  ])('worktree でも他の tool は通す: %s', (_label, toolName) => {
    expect(runGuard(mcp(toolName), worktreeDir)).toBe('allow');
  });
});
