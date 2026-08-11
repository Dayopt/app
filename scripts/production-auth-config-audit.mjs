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
  {
    key: 'mailer_allow_unverified_email_sign_ins',
    expected: false,
    failureMode: 'fail-open',
    why: '未確認アドレスでの sign in。on で確認前のアドレスがログインに使える',
  },
  {
    key: 'site_url',
    expected: 'https://app.dayopt.app',
    // 認証メール内のリンクの生成基点。書き換えられるとパスワードリセットのリンクが
    // 第三者オリジンを指す。
    failureMode: 'fail-open',
    why: '認証メールのリンク生成基点。書き換えでリセットリンクの宛先が変わる',
  },
  {
    key: 'uri_allow_list',
    // 順序と重複は Dashboard 操作で揺れるため、集合として比較する（`compare: 'set'`）。
    // **`security_captcha_secret` などと違い redirect URL は secret ではない。**
    expected: [
      'https://app.dayopt.app/**',
      'https://product-*-dayopt.vercel.app/**',
      'http://localhost:3000/**',
      'https://product-dayopt.vercel.app/',
      'https://product-dayopt.vercel.app/**',
      'https://product-*-dayopt.vercel.app',
    ],
    compare: 'set',
    // この audit が扱う中で最大の blast radius。緩められるとパスワードリセットの
    // リンクと OAuth code の配送先が第三者オリジンへ広がる。production の値は
    // Dashboard が正本で、`supabase/config.toml` の `additional_redirect_urls` は
    // production に効かないため repo 側に代替の検証手段が無い。
    //
    // 注意: #1935 が localhost の除去を予定している。production を変えたら同じ変更で
    // この期待値も更新する（それを強制するのがこの pin の目的）。
    failureMode: 'fail-open',
    why: 'redirect allowlist。緩めるとリセットリンクと OAuth code が第三者へ渡る',
  },
  {
    key: 'refresh_token_rotation_enabled',
    expected: true,
    failureMode: 'fail-open',
    why: 'refresh token の rotation。off で盗まれた token が無期限に使える',
  },
  {
    key: 'security_refresh_token_reuse_interval',
    expected: 10,
    // rotation の猶予窓。大きくなるほど「盗まれた token が使える時間」が伸びる連続量で、
    // rotation フラグを pin した上でこちらも固定して初めて保護が担保される。
    failureMode: 'fail-open',
    why: 'rotation の猶予秒数。伸ばすと盗まれた refresh token の有効時間が伸びる',
  },
  {
    key: 'security_sb_forwarded_for_enabled',
    expected: false,
    // client 由来の forwarded-for を GoTrue が信頼する設定。Product の通常 UI は
    // Supabase Auth を直接叩くため、per-IP rate limit（sign_in_sign_ups /
    // token_verifications / email_sent）がこの経路の唯一の backstop になる。on にすると
    // 偽装で回避でき、credential stuffing と認証メールのコスト増幅が通る。
    failureMode: 'fail-open',
    why: 'forwarded-for の信頼。on で per-IP rate limit が偽装で回避できる',
  },
  {
    key: 'hook_send_email_enabled',
    expected: true,
    // 認証メールは Auth Hook 経由で Resend から送る。off にすると確認メール・リセット
    // メールが届かなくなるが、UI 側はエラーにならない。
    failureMode: 'fail-closed',
    why: '認証メール送信 hook。off で確認・リセットメールが届かなくなる',
  },
  {
    key: 'hook_custom_access_token_enabled',
    expected: false,
    failureMode: 'fail-open',
    why: 'JWT へ claim を注入する hook。意図せず on になると claim の出所が増える',
  },
  {
    key: 'mfa_totp_verify_enabled',
    expected: true,
    // off にすると登録済みの TOTP 要素が検証できず、有効化した利用者が締め出される。
    failureMode: 'fail-closed',
    why: 'TOTP の検証。off で MFA 登録済みの利用者がログインできなくなる',
  },
  {
    key: 'mfa_allow_low_aal',
    expected: false,
    failureMode: 'fail-open',
    why: '低 AAL の許容。on で MFA を通さないセッションが保護領域へ入る',
  },
  {
    key: 'password_hibp_enabled',
    expected: true,
    failureMode: 'fail-open',
    why: '流出パスワードの拒否。off で既知の流出パスワードが設定できる',
  },
  {
    key: 'password_min_length',
    expected: 8,
    // `supabase/config.toml` の `minimum_password_length = 8` に対応する production 値。
    failureMode: 'fail-open',
    why: 'パスワード最小長。下げると弱いパスワードが通る',
  },
  {
    key: 'password_required_characters',
    expected: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
    // `supabase/config.toml` の `password_requirements = "letters_digits"` に対応する
    // production 表現（英字群 `:` 数字群）。
    failureMode: 'fail-open',
    why: 'パスワードの文字種要件。緩めると英数字混在の要求が消える',
  },
];

/**
 * 未分類キーの検出が見る名前空間。
 *
 * `external_*`（95 キー）と `mailer_*`（40 キー）は入れない。provider や mail template が
 * 増えるたびにキーが増える一方、**キーの存在自体は危険ではない**（危険なのは `*_enabled`
 * の値）ため、入れると誤検出が主成分になり形骸化する。両名前空間の危険な値は個別に pin
 * する。ここに挙げた 5 つは churn が低く、新設キーが安全性に効く確率が高い。
 */
const GUARDED_KEY_PREFIXES = ['security_', 'hook_', 'mfa_', 'sessions_', 'password_'];

/**
 * 契約に載せないと決めた boolean キー。**キー名だけを列挙し、値は読まない。**
 *
 * §未分類キーの検出 の除外リスト。ここに書くことは「見た上で pin しないと決めた」の
 * 意思表示で、書き忘れ・未知の新設定と区別がつく状態を保つ。**1 行足せば無言で新キーを
 * 黙らせられる**ため、`AUTH_CONFIG_CONTRACT` と同じく contract test がリテラル固定する
 * （export しているのはそのため）。
 */
export const ACKNOWLEDGED_UNPINNED_KEYS = [
  // 未使用の hook。有効化されたら pin する判断へ回す。
  'hook_after_user_created_enabled',
  'hook_before_user_created_enabled',
  'hook_mfa_verification_attempt_enabled',
  'hook_password_verification_attempt_enabled',
  'hook_send_sms_enabled',
  // SMS / WebAuthn は未提供。有効化は機能追加であって drift ではない。
  'mfa_phone_enroll_enabled',
  'mfa_phone_verify_enabled',
  'mfa_web_authn_enroll_enabled',
  'mfa_web_authn_verify_enabled',
  // TOTP の新規登録可否。締めても既存利用者は締め出されず、開けても検証は
  // `mfa_totp_verify_enabled` が担保する。
  'mfa_totp_enroll_enabled',
  // 同時セッション数の制限。現在は無効で、有効化は UX 判断（安全性の後退ではない）。
  'sessions_single_per_user',
];

/**
 * 契約にも除外リストにも無い boolean 設定を failure にする。
 *
 * 契約は「知っているキー」しか守れない。Supabase 側の設定追加や、spec に載らないキーの
 * 見落としは、片方向の drift 検出では**永久に可視化されない**（2026-08-11 に
 * `security_update_password_require_current_password` で実際に起きた）。未知のキーが
 * 現れたら 1 度 failure にして、pin するか除外リストへ入れるかの判断を強制する。
 *
 * **boolean だけを見る。** 安全性が静かに消えるのは on/off の gate で、同じ名前空間の
 * string / number（`*_uri` / `*_secrets` / `*_template` / timeout 類）まで対象にすると
 * 除外リストが肥大して形骸化する。triage 済みの非 boolean は個別に pin してある。
 *
 * キー名のみを扱い、値は出力しない。
 */
function auditKeyCoverage(config) {
  const contracted = new Set(AUTH_CONFIG_CONTRACT.map(({ key }) => key));
  const acknowledged = new Set(ACKNOWLEDGED_UNPINNED_KEYS);

  const unclassified = Object.entries(config)
    .filter(([key, value]) => typeof value === 'boolean' && !contracted.has(key))
    .map(([key]) => key)
    .filter((key) => GUARDED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .filter((key) => !acknowledged.has(key))
    .sort();

  if (unclassified.length === 0) return [];

  return [
    `unclassified security settings appeared: ${unclassified.join(', ')} — pin them in AUTH_CONFIG_CONTRACT (expected は必ず live 実測から起こす) or list them in ACKNOWLEDGED_UNPINNED_KEYS. どちらの場合も scripts/__tests__/production-auth-config-audit-contract.test.ts のリテラル固定を同じ PR で更新する`,
  ];
}

function describeValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** `compare: 'set'` の契約用。順序と重複の揺れで誤検出しないよう集合として比べる。 */
function toEntrySet(value) {
  const items = Array.isArray(value) ? value : String(value).split(',');
  return new Set(items.map((item) => item.trim()).filter((item) => item !== ''));
}

function setsDiffer(expected, actual) {
  const a = toEntrySet(expected);
  const b = toEntrySet(actual);
  if (a.size !== b.size) return true;
  return [...a].some((item) => !b.has(item));
}

function describeSetDiff(expected, actual) {
  const a = toEntrySet(expected);
  const b = toEntrySet(actual);
  const added = [...b].filter((item) => !a.has(item)).sort();
  const removed = [...a].filter((item) => !b.has(item)).sort();
  const parts = [];
  if (added.length > 0) parts.push(`added: ${added.join(' ')}`);
  if (removed.length > 0) parts.push(`removed: ${removed.join(' ')}`);
  return parts.join(' / ') || 'order or duplicates only';
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
  for (const { key, expected, compare, failureMode, why } of AUTH_CONFIG_CONTRACT) {
    if (!(key in config)) {
      errors.push(`${key} is missing from the Supabase Auth config response (${why})`);
      continue;
    }

    const actual = config[key];

    if (compare === 'set') {
      if (typeof actual !== 'string') {
        errors.push(`${key} must be a comma separated string, got ${typeof actual}`);
      } else if (setsDiffer(expected, actual)) {
        errors.push(
          `${key} drifted (${describeSetDiff(expected, actual)}) [${failureMode}] — ${why}`,
        );
      }
      continue;
    }

    // 想定外の shape が返った時に payload をそのまま CI ログへ出さない（型名だけ出す）。
    if (typeof actual !== typeof expected) {
      errors.push(`${key} must be ${typeof expected}, got ${typeof actual}`);
      continue;
    }

    if (actual !== expected) {
      errors.push(
        `${key} must be ${describeValue(expected)}, got ${describeValue(actual)} [${failureMode}] — ${why}`,
      );
    }
  }

  errors.push(...auditKeyCoverage(config));

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
