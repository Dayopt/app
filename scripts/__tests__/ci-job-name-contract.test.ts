import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * CI の job 表示名は「名前で success を要求する」3 つの gate の入力になっている。
 * YAML の `name:` を変えるだけで gate が静かに壊れる（永久に missing で止まる /
 * 逆に誤って green と判定する）ため、名前と参照側の一致をここで固定する。
 *
 * 参照している gate:
 * - `scripts/tasks/finish-branch.sh` の REQUIRED_CI_CHECKS（ci.yml の 3 job、#2415 / #2539）
 * - `.github/workflows/promote.yml` の層 3 gate（nightly.yml の 3 job、#2269）
 *
 * **とくに危ないのが ci.yml と nightly.yml の integration job**（2026-09-02、#2539 で
 * ci.yml 側に integration job を新設した）。両者は別物で:
 * - nightly.yml `Integration Tests` … 層 3。full fallback。promote gate が要求する
 * - ci.yml `🧪 Integration Tests` … per-PR。affected な PR だけ。finish-branch が要求する
 *
 * promote.yml の判定は `select(.name == $n)` の**完全一致**なので現状は衝突しないが、
 * ci.yml 側を絵文字なしの `Integration Tests` に改名した瞬間、per-PR の check run が
 * 層 3 の check として拾われ、**重量テストを一度も通していない SHA が promote を通過する**。
 * 絵文字の有無だけが両者を分けている状態を、その一致に依存していると明示して固定する。
 *
 * 併せて **ci.yml の checkout が資格情報を残さないこと**も固定する（#2539 のクロスレビュー
 * risk-reviewer P1）。ci.yml の job は PR branch のコードとその全依存（postinstall・vitest
 * transform・eslint plugin）を実行するため、`persist-credentials` を既定（true）のままに
 * すると `.git/config` の `http.extraheader` に GITHUB_TOKEN が残り、PR 側のコードから
 * `git config --get-all http.https://github.com/.extraheader` で読み出せる。unit job は
 * `pull-requests: write` / `issues: write` を持つので、これは書き込み権限の奪取に直結する。
 * この契約は **repo の全 workflow に適用する**。#2539 の時点で ci.yml は 4 件中 0 件、
 * nightly.yml は 6 件中 3 件が未指定だった（create-release.yml も未指定で、しかも
 * `contents: write` を持つ）。件数ではなく checkout ブロック単位で見る。
 */

const readWorkflow = (name: string) =>
  readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8');

/** `jobs:` 配下の `name: "..."` を job 表示名として抜き出す（`\UXXXXXXXX` を復元する）。 */
function jobDisplayNames(yamlText: string): string[] {
  return [...yamlText.matchAll(/^ {4}name: (.+)$/gm)]
    .map((match) => match[1].trim())
    .map((raw) => raw.replace(/^["']|["']$/g, ''))
    .map((value) =>
      value.replace(/\\U([0-9A-Fa-f]{8})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))),
    );
}

const ciNames = jobDisplayNames(readWorkflow('ci.yml'));
const nightlyNames = jobDisplayNames(readWorkflow('nightly.yml'));
const finishBranch = readFileSync(join(process.cwd(), 'scripts/tasks/finish-branch.sh'), 'utf8');
const promote = readWorkflow('promote.yml');

describe('CI job 名の契約', () => {
  it('ci.yml は impact / static / unit / integration の 4 job を持つ', () => {
    expect(ciNames).toEqual([
      '🧭 Impact',
      '🔍 Static Checks',
      '📦 Unit Tests',
      '🧪 Integration Tests',
    ]);
  });

  it('finish-branch.sh が要求する 3 job 名は ci.yml に実在する', () => {
    // 代入の形は 2 通りある（`REQUIRED_CI_CHECKS=("🔍 Static Checks")` と
    // 条件つきの `REQUIRED_CI_CHECKS+=("📦 Unit Tests")`）ので、配列リテラルの
    // 中身として現れることだけを見る。
    for (const name of ['🔍 Static Checks', '📦 Unit Tests', '🧪 Integration Tests']) {
      expect(finishBranch, `finish-branch.sh の REQUIRED_CI_CHECKS に「${name}」が無い`).toMatch(
        new RegExp(`REQUIRED_CI_CHECKS\\+?=\\("${name}"\\)`),
      );
      expect(ciNames, `ci.yml に「${name}」が無い`).toContain(name);
    }
  });

  it('promote.yml の層 3 gate が要求する 3 job 名は nightly.yml に実在する', () => {
    for (const name of ['🎭 E2E Tests', '🌐 Web Build & E2E', 'Integration Tests']) {
      expect(promote, `promote.yml が「${name}」を要求していない`).toContain(`"${name}"`);
      expect(nightlyNames, `nightly.yml に「${name}」が無い`).toContain(name);
    }
  });

  it('ci.yml と nightly.yml の job 名は 1 つも重複しない（層 3 gate の誤マッチ防止）', () => {
    const overlap = ciNames.filter((name) => nightlyNames.includes(name));

    expect(overlap).toEqual([]);
  });

  it('ci.yml の per-PR integration は層 3 の `Integration Tests` と別名である', () => {
    // 完全一致で判定されるため、この 1 文字の差が gate の分離そのもの。
    expect(ciNames).toContain('🧪 Integration Tests');
    expect(ciNames).not.toContain('Integration Tests');
    expect(nightlyNames).toContain('Integration Tests');
  });

  it('job 表示名に variation selector（U+FE0F）を含めない', () => {
    // check run 名は文字列一致で照合される。`🗄️` のように VS16 が付く絵文字を
    // YAML の `\UXXXXXXXX` 記法と併記すると、bash 側のリテラルと不一致になりうる。
    for (const name of [...ciNames, ...nightlyNames]) {
      expect(name, `${name} に VS16 が含まれる`).not.toContain('️');
    }
  });

  // ── checkout の資格情報（#2539 クロスレビュー risk-reviewer P1）─────
  describe('checkout は資格情報を残さない', () => {
    // **件数比較にしない**（同レビュー P3）。`checkout の数 === persist-credentials の数`
    // だと、解説コメントに `persist-credentials: false` という文字列を 1 行足した上で
    // 未指定の checkout を 1 件足すと数が揃って素通りする。この repo の workflow は
    // 日本語コメントが密なので現実的な偽陰性経路になる。step ブロック単位で見る。
    function checkoutStepsWithoutPersistFalse(yamlText: string): number[] {
      const lines = yamlText.split('\n');
      const offenders: number[] = [];
      lines.forEach((line, index) => {
        if (!/^\s*(-\s+)?uses:\s*actions\/checkout@/.test(line)) return;
        // この checkout step のブロック = 次の `- ` 始まりの step まで
        let hasPersistFalse = false;
        for (let i = index + 1; i < lines.length; i += 1) {
          const current = lines[i];
          if (/^\s*-\s/.test(current)) break; // 次の step
          if (/^\s*\w[\w-]*:/.test(current) && !/^\s+/.test(current)) break; // 次の top-level key
          const withoutComment = current.replace(/#.*$/, ''); // コメントは数えない
          if (/persist-credentials:\s*false/.test(withoutComment)) {
            hasPersistFalse = true;
            break;
          }
        }
        if (!hasPersistFalse) offenders.push(index + 1);
      });
      return offenders;
    }

    const WORKFLOWS = [
      'ci.yml',
      'nightly.yml',
      'promote.yml',
      'production-config-audit.yml',
      'create-release.yml',
    ];

    it.each(WORKFLOWS)('%s の全 checkout が persist-credentials: false を持つ', (name) => {
      const offenders = checkoutStepsWithoutPersistFalse(readWorkflow(name));

      expect(offenders, `${name} の ${offenders.join(', ')} 行目の checkout が未指定`).toEqual([]);
    });

    it('検査対象が repo の全 workflow を覆っている（追加漏れの検出）', () => {
      // **`.yaml` も拾う**（クロスレビュー risk-reviewer P2）。GitHub Actions は
      // 両方の拡張子を等しく受け付けるため、`.yml` だけを見ると `.yaml` で
      // 追加された workflow が検査からも網羅性 assert からも同時に落ちる。
      const actual = readdirSync(join(process.cwd(), '.github/workflows'))
        .filter((f) => /\.ya?ml$/.test(f))
        .sort();

      expect(actual).toEqual([...WORKFLOWS].sort());
    });

    it('未指定の checkout を検出できる（回帰確認）', () => {
      const regressed = [
        'jobs:',
        '  a:',
        '    steps:',
        '      - uses: actions/checkout@abc # v7',
        '      - uses: ./.github/actions/setup',
      ].join('\n');

      expect(checkoutStepsWithoutPersistFalse(regressed)).toEqual([4]);
    });

    it('コメント中の persist-credentials: false では通らない（偽陰性の回帰確認）', () => {
      // **コメントは checkout ブロックの内側に置く**（クロスレビュー risk-reviewer P3）。
      // 走査は checkout 行の次の行から始まるため、ブロックの外（前の行）へ置くと
      // 一度も評価されず、実装から comment-stripping を消してもこの test が通ってしまう
      // ＝ 主張している保証を証明できていない状態になる。
      const regressed = [
        'jobs:',
        '  a:',
        '    steps:',
        '      - uses: actions/checkout@abc # v7',
        '        with:',
        '          # persist-credentials: false を忘れないこと',
        '          fetch-depth: 0',
        '      - uses: ./.github/actions/setup',
      ].join('\n');

      expect(checkoutStepsWithoutPersistFalse(regressed)).toEqual([4]);
    });
  });

  // ── 検出力の確認（上の assert が「たまたま通っている」のではないこと）──
  describe('回帰確認', () => {
    it('jobDisplayNames は `\\UXXXXXXXX` 記法を実際の絵文字へ復元する', () => {
      const yaml = ['jobs:', '  unit:', '    name: "\\U0001F4E6 Unit Tests"'].join('\n');

      expect(jobDisplayNames(yaml)).toEqual(['📦 Unit Tests']);
    });

    it('ci.yml が層 3 と同名の job を持ったら重複として検出できる', () => {
      const regressed = ['jobs:', '  integration:', '    name: "Integration Tests"'].join('\n');
      const regressedNames = jobDisplayNames(regressed);

      expect(regressedNames.filter((name) => nightlyNames.includes(name))).toEqual([
        'Integration Tests',
      ]);
    });

    it('VS16 付きの job 名を検出できる', () => {
      const regressed = ['jobs:', '  integration:', '    name: "🗄️ Integration Tests"'].join('\n');

      expect(jobDisplayNames(regressed)[0]).toContain('️');
    });

    it('実ファイルから名前を 1 つ以上抜けている（regex の空振りで全 assert が素通りしない）', () => {
      expect(ciNames.length).toBe(4);
      expect(nightlyNames.length).toBeGreaterThanOrEqual(3);
    });
  });
});
