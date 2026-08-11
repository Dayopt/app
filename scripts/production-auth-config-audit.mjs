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
 * ## 監視対象は公開 OpenAPI spec から導出しない
 *
 * `https://api.supabase.com/api/v1-json` の `AuthConfigResponse` は **live 応答の完全な
 * 記述ではない**。2026-08-11 実測で live 242 キーに対し spec 237 キーで、6 キーが spec に
 * 存在しなかった。その 1 つが `security_update_password_require_current_password` で、
 * **app のパスワード変更が実際に依存している値**だった。
 *
 * spec を根拠に「そのフィールドは存在しない」と判断し、さらに live の確認も spec 由来の
 * キー名だけを射影したため、同じ盲点を二度通って誤りを検出できなかった（同日の事故）。
 * **監視対象は必ず live 応答の `keys` 列挙から起こす。** その規律を人手に頼らないため、
 * §未分類キーの検出 で「契約にも除外リストにも無い `security_*` キー」を failure にする。
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
    // 再認証 nonce（`reauthenticate()`）を要求するかどうかの設定で、`current_password` の
    // 検証を司るのは下の `..._require_current_password` の方（両者は別設定）。
    // Dayopt は nonce フローを実装していないので false が正しい。
    //
    // false -> true は「安全側」に見えるが、nonce 無しの `updateUser` が拒否されるように
    // なり、パスワード変更と reset 経路（`useAuthStore.ts` の `updatePassword` は
    // `current_password` 無しで呼ぶ）が止まりうるので fail-closed に分類する。
    failureMode: 'fail-closed',
    why: '再認証 nonce の要求有無。true になると nonce 未実装のフローが止まる',
  },
  {
    key: 'security_update_password_require_current_password',
    expected: true,
    // `updateUser({ password, current_password })` の `current_password` をサーバー側で
    // 検証させる設定。**app のパスワード変更はこの値に単独で依存している** —
    // `PasswordChangeDialog.tsx` は client 側の事前検証を持たない（公開 Auth endpoint は
    // Bot Protection 有効時に CAPTCHA token を要求され、認証済み画面から呼ぶと必ず失敗する
    // ため。#1917 / #1931）。off になると `current_password` はエラーも返さず黙って無視され、
    // 現在パスワードを知らないままパスワードを変更できる。
    //
    // このキーは公開 OpenAPI spec に載っていない（§監視対象は公開 OpenAPI spec から導出しない）。
    failureMode: 'fail-open',
    why: '現在パスワードのサーバー側検証。off で現在パスワード無しの変更が黙って通る',
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

/**
 * 契約に載せないと決めた `security_*` キー。**キー名だけを列挙し、値は読まない。**
 *
 * §未分類キーの検出 の除外リスト。ここに書くことは「見た上で pin しないと決めた」の
 * 意思表示で、書き忘れ・未知の新設定と区別がつく状態を保つ。
 */
const ACKNOWLEDGED_UNPINNED_SECURITY_KEYS = [
  // secret 値そのもの。値を読まない方針なので pin の対象にしない。
  'security_captcha_secret',
  // refresh token 再利用の猶予秒数。安全性の on/off ではなくチューニング値。
  'security_refresh_token_reuse_interval',
  // 信頼する forwarded-for ヘッダの扱い。Dayopt の現在の構成では判断材料になっていない。
  'security_sb_forwarded_for_enabled',
];

/**
 * 契約にも除外リストにも無い `security_*` キーを failure にする。
 *
 * 契約は「知っているキー」しか守れない。Supabase 側の設定追加や、spec に載らないキーの
 * 見落としは、片方向の drift 検出では**永久に可視化されない**（2026-08-11 に
 * `security_update_password_require_current_password` で実際に起きた）。未知のキーが
 * 現れたら 1 度 failure にして、pin するか除外リストへ入れるかの判断を強制する。
 *
 * キー名のみを扱い、値は読まない。
 */
function auditSecurityKeyCoverage(config) {
  const contracted = new Set(AUTH_CONFIG_CONTRACT.map(({ key }) => key));
  const acknowledged = new Set(ACKNOWLEDGED_UNPINNED_SECURITY_KEYS);

  const unclassified = Object.keys(config)
    .filter((key) => key.startsWith('security_'))
    .filter((key) => !contracted.has(key) && !acknowledged.has(key))
    .sort();

  if (unclassified.length === 0) return [];

  return [
    `unclassified security settings appeared: ${unclassified.join(', ')} — pin them in AUTH_CONFIG_CONTRACT or list them in ACKNOWLEDGED_UNPINNED_SECURITY_KEYS`,
  ];
}

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

  errors.push(...auditSecurityKeyCoverage(config));

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
