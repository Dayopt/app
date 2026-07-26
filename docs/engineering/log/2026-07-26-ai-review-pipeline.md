---
status: frozen
date: 2026-07-26
code: scripts/ai-review
---

# 異系統コードレビューを subscription から自前 pipeline へ移し、危険クラスの PR だけに限定する

## 背景・当時の前提

AI 開発予算（$100-200/月）の配分を検討する中で、レビュー層の必要性を検証した。

- 実装・テスト・内部レビューがすべて同一モデル系統（Claude）で行われており、系統固有の盲点は内部でいくら層を重ねても検出できない。実例として 2026-05-11 の `useReviewDateDisplayProps` の granularity 回帰は、Claude が実装して通したものを Codex が検出している
- 一方で「レビューは常にクリティカル」ではない。可逆なバグ（UI 崩れ、ロジックの取りこぼし）は決定論的ゲート・Sentry・dogfooding が拾う。クリティカルなのは**沈黙して失敗するクラス**（RLS の穴、auth 境界、migration のデータ破壊、課金の不整合、時刻契約違反）だけで、そこは例外を投げずテストも通るため他の網が構造的に発火しない
- 既存の検出層を実地検証したところ、いずれも最適化済みだった。CI は static 4 lane 並列 + unit 2000 本超 + E2E フルスイート（13 spec）+ bundle secret scan、`rls-access.integration.test.ts` が cross-user アクセス・`SECURITY DEFINER` の `auth.uid()` 照合・列単位 GRANT を検証、RLS snapshot の drift 検出も CI にある。Sentry は #1566 で sanitizer / project 分離 / alert まで整備済み
- 残る空白は「Claude と相関しない目」だけだが、その供給が不安定だった。Copilot は quota 切れが頻発、Codex は ChatGPT Plus $20 の主目的がレビューだけになり、CodeRabbit は約 $24 かつ nitpick の triage 税が高い

## 決定と理由

**レビュアーを subscription で借りるのをやめ、レビューの仕様を repo が所有する。** `scripts/ai-review/` + `.github/workflows/ai-review.yml` として自前の cross-family review pipeline を実装した。

- **モデルは Gemini 3 Pro（Google 系）**。Copilot は OpenAI 系なので、Google を選ぶと「Anthropic が書き、OpenAI と Google が見る」三系統になり独立性が最大化される。model id は `AI_REVIEW_MODEL` repo variable で差し替え可能にした（provider 側の改称に追従するため）
- **有料枠を使う**。Google AI Studio の無料枠は入力を製品改善に使う規約のため、private repo の diff を流さない。課金有効の key を使い、学習不使用の条件で運用する
- **危険クラス path 限定**。`supabase/migrations` / `supabase/functions` / `features/*/server` / `features/auth` / `lib/{database,supabase,trpc}` / `app/api` を触る PR だけ発火する。それ以外の PR では 1 トークンも使わない。paths filter と `DANGEROUS_PATH_PATTERNS` の一致は contract test で固定した（片方だけ広げると green のまま gate が消えるため）
- **沈黙をデフォルトにする**。契約（`prompt.md`）で「他の層が担保済みのもの（型・テスト・style・整形・bundle）は報告禁止」「確信が持てなければ黙る」「具体的 failure scenario を書けない指摘は捨てる」「最大 5 件」を明示した。借り物のレビュアーでは変更できないこの部分こそが、triage 税を仕様で潰す本体
- **repo 規約を渡す**。diff の内容に応じて security skill / temporal-constraints / feature-boundaries を自動添付し、migration を触る PR には RLS snapshot の該当 table section だけを抜いて渡す。CodeRabbit の唯一の差別化だった「規約注入」を自前で持つ
- **P0 は既存のマージゲートに接続する**。P0 検出時に exit 1 → check fail → `branch:finish` の「失敗 check があればマージしない」が自動で効く。新しいゲートを足していない
- **所見では fail-closed、インフラ障害では fail-open**。API 障害 / quota / secret 未設定 / fork PR ではブロックしない。ただしモデル応答の shape が壊れている場合は throw する（「指摘なし」と読み替えると gate が green のまま無効化されるため）

実測コスト: migration を含む実 commit での dry-run で prompt 約 49KB（約 12k tokens）。月 30-50 回の発火で $3-8 程度。

## 却下した選択肢と、なぜ捨てたか

- **Claude 内の pre-PR レビュー skill だけで済ませる** — repo 規約の深掘りには最も強いが、実装側と同一モデルのため誤りが相関する。self-evaluation bias もあり「複数 agent の一致は証拠ではない」（AGENTS.md）に反する。補完関係であって代替関係ではないため、既存の guard 群（plan-critic / architecture-guard / behavior-verifier / risk-reviewer）は残す
- **Codex / CodeRabbit / Copilot の subscription** — 月 $20-24 を払っても、プロンプト（＝何を報告するか）を変更できず、quota に縛られ、repo 規約を知らない。従量 API なら同じ検出力が月数ドルで、契約に依存しない
- **全 PR を対象にする** — style / 設計の好みは決定論ゲートと内部レビューの領分。全 PR に広げるとノイズが増え、危険クラスの指摘が埋もれる
- **Gemini + GPT の二枚看板** — 最危険領域だけ union を取る案。現時点では YAGNI とし、月次ガーデニングでの実測後に判断する
- **provider SDK の依存追加** — `fetch` 直で足りる（依存追加基準に従う）

## 影響・やること

- **導入直後は観察モード（`AI_REVIEW_ENFORCE` 未設定）**。P0 でも check を fail させず、コメントだけ残す。この gate は PR #1738 の時点で一度も end-to-end 実行されておらず（危険クラスを含む PR がまだ無い）、誤爆の実績が未知のため。実 migration PR で数回動かし、指摘の質を見てから `AI_REVIEW_ENFORCE=true` で blocking へ切り替える

- ユーザー作業: Google AI Studio で課金有効の API key を発行し、repo secret `GEMINI_API_KEY` に登録する。未登録の間は warning を出して skip する（PR はブロックされない）
- `prompt.md` の変更は専用 PR で行う。実装 PR の中で監査対象が自分の監査契約を書き換えない運用規律とする
- 退場条件: 月次ガーデニングで「決定論ゲートと内部レビューが拾えなかった unique catch」を棚卸しし、3 ヶ月連続でゼロなら削除する。導入と同じ実測主義で退場も決める
- 予算面: ChatGPT Plus の固有価値が Codex review のみになったため、解約判断の材料が揃った（メール / RSS は Claude 側の Routines、画面操作は Playwright MCP + Claude in Chrome で代替可能）
