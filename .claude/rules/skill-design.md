# Skill 設計ルール

Dayopt の `.claude/skills/` 配下に置く project skill を設計する際の恒常ルール。description と `SKILL.md` 本体の書式、skill 間の境界、skill 層と rules 層の境界を定義する。

skill は Claude Code の `Skill` tool から invoke される仕組み上、**description が invocation 判断の主戦場、本文は invoke 後の行動強化**という役割分担を前提にする。

---

## 1. Skill 類型

project skill は以下 6 類型のいずれかに属する。類型は description / When to Use の書式選択と要素数上限に影響する。

| 類型             | 特徴                                           | 発動契機                      | 要素数目安   | 例                                                                    |
| ---------------- | ---------------------------------------------- | ----------------------------- | ------------ | --------------------------------------------------------------------- |
| 作成系           | 新規ファイル / 構造の生成が主目的              | 明示的な作成意図 + コード変化 | 5-6          | `storybook` / `trpc-router-creating` / `store-creating`               |
| 予防系           | 実装後の漏れ検出・品質担保                     | コード変化 + 診断             | 5-6          | `security` / `test` / `optimistic-update` / `i18n` / `error-handling` |
| 運用系           | 複数軸（ファイル / 設定 / 環境）を跨ぐ運用支援 | 特定ファイル/設定変更         | 6（250字枠） | `supabase`                                                            |
| 副次トリガー型   | コード変化ではなく上位イベント確定がトリガー   | 上位イベント確定後            | 7            | `docs-writing`                                                        |
| 明示発動型       | ユーザーの explicit な意図のみを契機           | 明示的な意図発話              | 4            | `releasing`                                                           |
| ライフサイクル型 | パイプラインの各ステージが発動契機             | パイプライン進行              | 8            | 現在該当なし（旧 `eagle-dayopt`、2026-07-23 撤去）                    |

「要素数」は When to Use の bullet 総数（実装起点 + 診断起点）。類型ごとの目安であり、hard cap ではなく soft guidance。

---

## 2. description の書式

Claude Code の skill routing は description を読んで invocation を判断する。description はリライト前提で、先頭句にトリガーフレーズを埋め込む。

### 2.1 字数

- **通常**: 200 字目標、220 字上限
- **運用系 / ライフサイクル型**: 250 字枠まで許容

### 2.2 先頭句

- **default**: 具体列挙先行（「A の時、B の時、C の時に発動。」）
- **許容**: 概括先行（「〜の新規作成・既存更新時に発動。」）— skill の責務が単一動詞で括れる場合のみ（例: `storybook` = 「Story 作成・更新」）

### 2.3 構造

```
[トリガー 5-6 個を読点区切りで列挙]に発動。[core rule を 1 文で declarative に記述]。[NOT 条件 1-2 個]。
```

core rule は declarative（「適用する」「従う」「レビューする」「指導する」）で書く。imperative（「強制する」）は避ける。

---

## 3. `SKILL.md` 本文: When to Use の書式

### 3.1 通常型（作成系 / 予防系 / 運用系）

```markdown
## When to Use

以下の状況で発動:

- [実装起点 bullet 1]
- [実装起点 bullet 2]
- ...
- [診断起点 bullet 1]
- [診断起点 bullet 2]
```

- 並び順: **実装起点 → 診断起点**（フラットな bullet リスト、サブ見出しは使わない）
- 要素数: 5-6
- 各 bullet は「動詞 + 具体的なコード/設定変化」または「動詞 + 具体的な file / symbol 参照」で書く

### 3.2 特殊型（副次トリガー型 / 明示発動型 / ライフサイクル型）

特殊型は通常型と発動契機が質的に異なるため、類型名を太字 heading で明示する。書式:

```markdown
## When to Use

**{類型名}** — [この skill の発動特性を 1 文で説明]。

[必要に応じてサブ見出しで起点を分類]
```

類型別の詳細:

- **副次トリガー型**: 「上位イベント起点 → 診断起点」でサブ見出し分割。要素数 7 まで許容
- **明示発動型**: サブ見出しなし、フラット bullet。要素数 4 が目安
- **ライフサイクル型**: 「パイプラインステージ起点 → 診断・参照起点」でサブ見出し分割。要素数 8 まで許容

### 3.3 診断起点数の判断基準

類型ではなく **「検出対象の explicit さ」** で判断する:

- 検出対象が**コード変化として explicit に現れる**（auth 境界変化、migration ファイル追加など）→ 診断起点 0-1 件で十分
- 検出対象が**検出行為を必要とする**（ハードコード文字列、try/catch 漏れ、onMutate 欠損など）→ 診断起点 2-3 件が自然

### 3.4 外部起点の扱い

コード変化ではなく外部起点（Figma デザイン変更、Webhook / OAuth callback、外部 API レスポンスなど）が発動契機になる場合、通常の bullet と同列に含めてよい。必須要件ではなく、該当 skill のみに含める。

外部起点は「コード差分だけでは拾えない invocation 判断」を補強する。例: `storybook` の「Figma 由来のデザイン変更反映時」、`security` の「外部 API/Webhook からのデータ取り込み」。

---

## 4. `SKILL.md` 本文: When NOT to Use の書式

### 4.1 基本方針

NOT 条件は「**invoke しそうに見えて実は不要**」なケースに限定する。自明な NOT（「関係ないファイルを触った時」など）は書かない。要素数 2-3 が目安。

### 4.2 Redirect 先の記法

NOT 条件が「本来この領域を担当する他の箇所」を指す場合、redirect 先を明記する。記法は redirect 先の種類で分ける:

| Redirect 先                   | 記法                                           | 例                                                           |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| 他の skill                    | `(skill-name skill の領域)` 括弧明記           | `(storybook skill の視覚検証領域、test 対象外)`              |
| `CLAUDE.md` / rules/ のルール | `(CLAUDE.md の {rule-name} ルールに従う)`      | `(CLAUDE.md の copywriting ルールに従う、ロジック変更なし)`  |
| 自動生成 artifact             | `(XX 後の自動反映)` など artifact の由来を明記 | `(types:generate 後の自動反映)`                              |
| 自然な境界（redirect 先なし） | 括弧省略                                       | `単一 component 内で完結する local state（useState で十分）` |

### 4.3 明示発動型の NOT（特例）

明示発動型は「該当なし + 近接ケース列挙」の型を使う。単に「該当なし」だけだと境界が具体化せず、近接ケースで遷移先を示すことで skill 境界が self-documenting になる。

記法は**矢印記法**を使う（明示発動型限定）:

```markdown
この skill は **explicit {意図} のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- {近接ケース 1} → {遷移先}
- {近接ケース 2} → {遷移先}
- {近接ケース 3} → {遷移先}
```

矢印記法は**明示発動型の近接ケース列挙でのみ**使用する。他の類型で矢印記法を使うと表記が散らかるため避ける。

---

## 5. 境界設計原則

### 5.1 Skill 間の明示的 handoff

skill が他 skill の領域に触れる場合、skill 名を明示的に書く。これは 2 方向の記述がある:

- **NOT 条件での redirect**: 「この領域は別 skill が担当する」→ 4.2 の括弧明記
- **When to Use での handoff 受領**: 「この skill からのフィードバックで発動」→ bullet 内に skill 名を明記

例: `docs-writing` の When to Use に `docs-audit skill から docs gap / 鮮度低下のフィードバックを受けた時` と記述。skill 間の明示的 handoff は skill routing の中で最も強い signal。

### 5.2 Skill 層と rules 層の境界

NOT 条件が他 skill の領域ではなく `CLAUDE.md` / `.claude/rules/` 配下のルールに属する場合、rules 参照記法を使う:

```
(CLAUDE.md の {rule-name} ルールに従う、{補足})
```

これにより「なぜ X skill を作らないか」（= 既存の rule で十分だから）が既存 skill の NOT から self-documenting になる。将来「X skill を作ろうか」と考えた時に、skill 層に持ち上げなかった判断根拠を再確認できる。

### 5.3 自動生成 artifact の扱い

**自動生成 artifact の変更それ自体は skill invocation 契機にしない。**

対象例:

- `apps/product/src/lib/database/generated/database.types.ts`（`types:generate` 結果）
- `.next/` build artifact
- `coverage/` test coverage report
- Zod からの型 inference 結果

ただし、自動生成物を参照して**別の作業**（ドキュメント化、リファクタリング）を行う場合は、その作業内容に基づいて通常通り skill invocation を判断する。この精度で書かないと「types.ts を参照する docs 作業では docs-writing は invoke する」という正当なケースを除外してしまう。

### 5.4 Invocation トリガーと実行時ルールの分離

description と When to Use は「**いつ invoke するか**」の純粋リスト。skill invoke 後に守らせたい実行時ルール（使うべきコマンドフラグ、デプロイ順序、設定値など）は別セクション（例: `## 絶対ルール`）に分離する。

例: `supabase` skill の description / When to Use には Edge Function デプロイ契機のみを書き、`--use-api` フラグ必須・`db push` の挙動・Staging/Production の順序などの実行時ルールは `## 絶対ルール` に分離している。

混在させると invocation 判断が「このフラグをつけるべき時」まで含めて重くなり、description の情報密度が落ちる。

### 5.5 Self-contained 原則

**project skill の description と本文は、repo に commit される情報のみで self-contained でなければならない。**

- 参照可能: 同一 repo 内のファイル（`CLAUDE.md`, 他 skill docs, `.claude/rules/`, コード）、公開 URL
- 参照不可: 個人メモリ（`~/.claude/projects/.../memory/`）、user-global skill（`~/.claude/skills/`）、個人設定、外部の非公開情報

個人文脈が必要な skill は user-global skills に置く。project / user-global の境界はこの問題を分離するために存在する。solo dev のうちは緩めても動くが、他の dev が repo を clone した瞬間に壊れる skill を作らない。

---

## 6. 空白領域 flag（未カバー領域）

既存 skill の NOT 条件で「redirect 先がない自然な境界」として記述されているが、将来 skill 化の余地がある領域の記録。

| 領域      | 現状                                                                   | 将来の判断                                                                                      |
| --------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| URL state | `store-creating` NOT に `(searchParams / useRouter の領域)` として記述 | Dayopt で URL state パターン（`nuqs` 等の library 採用）が増えたら `routing-state` skill を検討 |

新規 skill 追加時は「既存 skill の NOT に redirect 先として既に用意されているか」を確認する。用意されていれば、既存 skill 側の記述はそのまま機能し続ける。

---

## 7. 新規 skill 追加時のチェックリスト

- [ ] 責務が 6 類型のいずれかに明確に属する（複数類型にまたがる場合は分割を検討）
- [ ] description が類型別の字数・構造ルールに従う
- [ ] When to Use の要素数が類型別目安の範囲内
- [ ] 並び順が「実装起点 → 診断起点」（特殊型は類型別ルール）
- [ ] NOT 条件が「invoke しそうに見えて実は不要」に限定されている
- [ ] NOT 条件の redirect 先が 4.2 の記法に従って明記されている
- [ ] 他 skill との境界が既存 skill の When to Use / NOT と整合する（相互参照の skill 名が正確）
- [ ] 個人メモリ / user-global skill を参照していない（self-contained）
- [ ] 自動生成 artifact を発動契機にしていない
