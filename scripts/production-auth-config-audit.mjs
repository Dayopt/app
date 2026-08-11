import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * production Supabase Auth の enforcement 値の drift を検出する（#1926）。
 *
 * `supabase/config.toml` の `[auth.*]` は **local と PR Preview branch にしか効かない**
 * （production の Auth 設定は Supabase Dashboard が正本。GitHub integration の Deploy to
 * production は migration / Edge Functions / Storage bucket だけを同期する）。そのため
 * local integration test では production 側の enforcement 値を原理的に検証できず、
 * Dashboard で 1 つトグルが変わっただけで安全性が静かに消える経路が残る。
 *
 * この script は Supabase Management API の `GET /v1/projects/{ref}/config/auth` を読み、
 * 契約に列挙した値だけを期待値と突き合わせる。**production の設定は一切変更しない。**
 *
 * ## 依存を持たない
 *
 * 本 script は repo 内の他ファイルを import しない（定数はこのファイルに閉じる）。CI で
 * account 単位の Supabase PAT を渡す実行経路になるため、契約保護の対象を 1 ファイルに
 * 閉じ込め、無保護な import 先が実行経路に混ざるのを防ぐ。契約は
 * `scripts/__tests__/production-auth-config-audit-contract.test.ts` が固定する。
 *
 * ## 値の出力について
 *
 * 応答には `security_captcha_secret` や SMTP 認証情報などの secret が同梱される。
 * allowlist（`AUTH_CONFIG_CONTRACT`）に列挙した key 以外は**読まないし出力しない**。
 * 列挙した key は boolean と enum だけで、値そのものが credential になり得ないため、
 * 失敗時の原因特定のために実測値を error message に含める（`docs/operations/secrets.md`
 * §API 経由の設定読戻し の射影規則における明示 allowlist に当たる）。
 */

/** production project（`docs/engineering/infra.md`）。secret ではない。 */
export const SUPABASE_PRODUCTION_PROJECT_REF = 'yvglwblxrnrenfifsnje';

/**
 * 監視対象と期待値の正本。
 *
 * `expected` はすべて 2026-08-11 に production の実値を読み取って確定した（推測値を
 * 置くと audit が恒久 failure になり、drift 検出そのものが止まる）。値を変える時は
 * 「Dashboard を変えたから contract を追従させる」のではなく、**変更が意図したもので
 * あることを PR で示してから**追従させる。
 *
 * ## 故障の向き（`failureMode`）
 *
 * 「設定が緩む方向に変わったら警報」という片方向の設計にしない。**判定は期待値との
 * 等値**なので、緩む方向（fail-open: 本来止まる操作が黙って通る）と締まる方向
 * （fail-closed: 本来通る操作が黙ってできなくなる）の**どちらの drift も検出する**。
 *
 * `failureMode` はその値が drift した時に起きる故障の向きの分類で、警報条件ではなく
 * 失敗時の読み解きに使う。実際 `security_captcha_provider` と
 * `security_update_password_require_reauthentication` は fail-closed 側で、
 * 「安全側に倒れる変更」に見えて login やパスワードリセットを止めうる。
 */
export const AUTH_CONFIG_CONTRACT = [
  {
    key: 'security_update_password_require_reauthentication',
    expected: false,
    // `supabase/config.toml:200` の `secure_password_change = true` に対応する production 値。
    // **production では現在 off** で、config.toml との drift が既に存在する（2026-08-11 実測）。
    // GoTrue で `updateUser({ password, current_password })` の `current_password` を有効に
    // するのはこの 1 設定で、off の間はサーバー側で検証されない。
    //
    // 注意: `PasswordChangeDialog.tsx` は `security_update_password_require_current_password`
    // が true であることを根拠に client 側の事前検証を持たない実装になっているが、その名前の
    // 設定は Management API に存在しない（`AuthConfigResponse` を走査して確認）。この矛盾は
    // 本 audit の scope 外として auth レーン（#1928 / #1925、`docs/product/specs/auth.md` の
    // writer）へ回した。
    //
    // true への引き上げは password reset 経路（`useAuthStore.ts` の `updatePassword` は
    // `current_password` 無しで `updateUser` を呼ぶ）への影響検証と production 変更を伴う
    // ため、まず現在値を固定して無自覚な変化を検出できるようにする。false -> true は
    // 「安全側」に見えるが上記 reset 経路が止まりうるので fail-closed に分類する。
    failureMode: 'fail-closed',
    why: '現在パスワードのサーバー側検証の有無。変化は password 変更フローの保証を変える',
  },
  {
    key: 'mailer_secure_email_change_enabled',
    expected: true,
    // `supabase/config.toml:196` の `double_confirm_changes = true` に対応。off になると
    // メール変更が旧アドレスの確認なしで通り、アカウント乗っ取りの経路になる。#1917 の
    // 修正後、メール変更の本人確認はこの値への単独依存になっている。
    failureMode: 'fail-open',
    why: 'メール変更時に旧アドレスの確認を要求する。off でアカウント乗っ取りが成立する',
  },
  {
    key: 'security_captcha_enabled',
    expected: true,
    // off になると signup / login の captcha 検証が消える。app 側は widget を出し続ける
    // ため、UI からは無効化に気づけない。
    failureMode: 'fail-open',
    why: 'Bot Protection の有効状態。off で captcha 検証が消える',
  },
  {
    key: 'security_captcha_provider',
    expected: 'turnstile',
    // app が埋め込むのは Turnstile widget 固定（`docs/engineering/infra.md` §Bot Protection）。
    // provider が変わると captcha は「有効なまま」なのに token が拒否され、login / signup が
    // 全滅する。緩む方向ではなく操作が止まる方向の故障で、#1924 と同じ故障クラス。
    // 外形監視（`/api/health`）では検出できない。
    failureMode: 'fail-closed',
    why: 'captcha provider。app の Turnstile widget と不一致だと login が全滅する',
  },
  {
    key: 'security_manual_linking_enabled',
    expected: false,
    // `supabase/config.toml:160` の `enable_manual_linking = false` に対応。
    failureMode: 'fail-open',
    why: '手動 identity linking。on になると任意 identity の結合が可能になる',
  },
  {
    key: 'external_anonymous_users_enabled',
    expected: false,
    // `supabase/config.toml:158` の `enable_anonymous_sign_ins = false` に対応。
    failureMode: 'fail-open',
    why: '匿名サインイン。on になると認証なしの user 行が作られる',
  },
  {
    key: 'mailer_autoconfirm',
    expected: false,
    // on になるとメール確認が省略され、他人のアドレスでの signup がそのまま確定する。
    failureMode: 'fail-open',
    why: 'メール確認の省略。on で未確認アドレスの signup が成立する',
  },
];

function describeValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * fail closed: key の欠落（API バージョン差 / 改名）と型の不一致は failure とする。
 * 「取得できていない」を「確認できた」と誤読しないため、compliant 側へ倒さない。
 */
export function auditSupabaseAuthConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['Supabase Auth config response is invalid'];
  }

  const errors = [];
  for (const { key, expected, failureMode, why } of AUTH_CONFIG_CONTRACT) {
    if (!(key in config)) {
      errors.push(`${key} is missing from the Supabase Auth config response (${why})`);
      continue;
    }

    const actual = config[key];
    if (typeof actual !== typeof expected) {
      errors.push(
        `${key} must be ${typeof expected}, got ${typeof actual} (${describeValue(actual)})`,
      );
      continue;
    }

    if (actual !== expected) {
      errors.push(
        `${key} must be ${describeValue(expected)}, got ${describeValue(actual)} [${failureMode}] — ${why}`,
      );
    }
  }

  return errors;
}

async function fetchAuthConfig(projectRef, token, fetchImpl) {
  const response = await fetchImpl(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // 本文には secret が同梱されるため、失敗時もレスポンスを出力しない（curl --fail 相当）。
  if (!response.ok) {
    throw new Error(`Supabase Auth config request failed for project: ${projectRef}`);
  }

  // 2xx でも本文が JSON でないことがある（proxy の HTML など）。`response.json()` の
  // parse error は本文の先頭を message に含めるため、そのまま投げると「本文を出力しない」
  // 不変条件が破れる。固定文言へ置き換える。
  try {
    return await response.json();
  } catch {
    throw new Error(`Supabase Auth config response was not JSON for project: ${projectRef}`);
  }
}

export async function runProductionAuthConfigAudit({
  token,
  projectRef = SUPABASE_PRODUCTION_PROJECT_REF,
  fetchImpl = fetch,
}) {
  if (!token) {
    throw new Error('SUPABASE_AUTH_AUDIT_TOKEN is required for Production Auth Config Audit');
  }

  const config = await fetchAuthConfig(projectRef, token, fetchImpl);
  const errors = auditSupabaseAuthConfig(config);

  if (errors.length > 0) {
    throw new Error(
      `Production Auth Config Audit failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }
}

/**
 * 直接実行された時だけ audit を走らせる。
 *
 * 素の `` import.meta.url === `file://${process.argv[1]}` `` は path の空白・非 ASCII で
 * 一致しない。さらに Node は entry point を realpath へ解決してから `import.meta.url` を
 * 決めるため、symlink 経由（macOS の `/tmp` → `/private/tmp` など）でも一致しない。
 * どちらも「何も実行せず exit 0」= fail open になるので、両方を正規化して比較する。
 */
function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  runProductionAuthConfigAudit({ token: process.env.SUPABASE_AUTH_AUDIT_TOKEN })
    .then(() => {
      console.log('Production Auth Config Audit passed (allowlisted enforcement values only).');
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Production Auth Config Audit failed');
      process.exitCode = 1;
    });
}
