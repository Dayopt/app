# ワークフロー規約

策定日: 2026-04-23

Dayopt の作業を進める際の規約。作業規模に応じて進め方を使い分ける。

## 作業規模の判定

以下のいずれか 1 つでも該当 → **大規模**（保守的判定）:

- 想定コミット数 6 以上
- 想定 Step 数 5 以上
- 想定作業時間 1 日以上
- blast radius が shell / layout / routing 横断
- 未知の発見リスクが高い（設計途中で方針変更ありうる）
- 新 feature の新設

いずれかに該当 → **中規模**:

- 想定コミット数 3-5
- 想定 Step 数 2-4
- 想定作業時間 半日程度
- 1 feature 内に閉じる

上記以外 → **小規模**:

- 想定コミット数 1-2
- 想定 Step 数 1
- 想定作業時間 1 時間以下
- 1 ファイル / 1 module に閉じる

## 規模別の進め方

### 大規模

- Project 全体設計書を必ず作成（`docs/projects/{project-name}/overview.md`）
- 複雑な Step は Step 詳細設計書（`step-X-detail.md`）
- 各 Step で事前調査プロンプト必須
- 相談事項は Option α/β/γ 形式で提示
- path-limited add / git diff --cached を必須ゲートに

### 中規模

- Project 全体設計書は推奨（省略する場合は理由を明示）
- Step 詳細設計書は省略可
- 事前調査プロンプトは推奨
- 相談事項は Option 形式
- path-limited add は採用

### 小規模

- 設計書作成不要
- 事前調査プロンプト省略可
- 直接実装プロンプトで OK
- blast radius を事前確認のみ

### 迷った時

規模を大きめに判定して手法をフル採用。overhead より手戻り回避を優先。

## Project 命名規則

形式: `{domain}-{action}[-{variant}]`

原則:

- **domain**: 主要な影響範囲（sidebar / tag / auth / calendar / stats / ai 等）
- **action**: 動詞ベース（redesign / migration / refactor / unification / cleanup 等）
- **variant**: 必要なら区別（design / implementation / cleanup 等）
- kebab-case で統一
- Phase N-X のような記号的命名は使わない
- 連続 project は domain 接頭辞で関係性を表現

### 実例

**良い例**:

- `sidebar-routing-unification`（旧 Phase 2-B）
- `sidebar-3-mode-structure`（旧 Phase 2-C）
- `sidebar-v2-design`（旧 Phase 2-D）
- `feature-colocation-migration`（旧 Phase 2-E）
- `tag-management-refactor`
- `watching-ai-implementation`

**悪い例**:

- `phase-2-c`（記号的、内容不明）
- `sidebar-work`（action が曖昧）
- `fix-stuff`（domain 不明）

## 設計書の保存場所

散文の設計書は repo 直下 `docs/projects/` に置く（Storybook には載せない。ビルド不要で GitHub 上でそのまま読める。`<Meta>` ラッパー不要の素の Markdown）。

### 進行中

```
docs/projects/{project-name}/
├── overview.md        — Project 全体設計書
└── step-X-detail.md   — Step 詳細設計書（必要なら）
```

または簡略形式として `docs/projects/{project-name}-detail.md` 1 ファイル。

### 完了後

Project 完了時も同じ `docs/projects/{project-name}/` に置いたまま `summary.md` を追加:

```
docs/projects/{project-name}/
├── overview.md
├── step-X-detail.md
└── summary.md         — 完了時に追加（達成した成果）
```

移動時の作業:

- git mv で履歴追跡
- 内部リンクの path 修正
- `summary.md` を新規追加（Project 完了サマリー）

### src/ にはコロケーションしない

設計書は Project 単位（複数ファイル横断）の情報なので、src/ の個別コードにコロケーションしない。src/ はコード専用、設計書は `docs/projects/` に集約する。

ただし feature 単位の長期設計（ARCHITECTURE.md 相当）は feature 内コロケーションの選択肢あり。これは Project 設計書とは別物。

## 共通ゲート（規模によらず）

### path-limited add

関係ない dirty ファイル（他タスクの中間状態等）を誤って staged しないよう、明示的に add する:

```bash
git add path/to/file1
git add path/to/file2
```

`git add .` は避ける。

### git diff --cached

commit 前に必ず `git diff --cached` で index 内容を確認する。Edit ツールで変更した内容が working tree のみに反映されて index に入っていないケースを防ぐ（Step C-1 事故の教訓）。

### PR merge policy

PR を merge する時は、原則として merge commit を残す:

```bash
gh pr merge <PR番号> --merge --delete-branch
```

理由: `git log --graph` で branch の分岐と合流が見える履歴を維持するため。`--squash` はユーザーが明示した時、または release 手順など既存プロセスが明示している時だけ使う。

### typecheck / lint / build

中規模以上の作業では以下を必ず pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm lint:boundaries`
- `pnpm build`（routing / layout 変更時）

### Storybook 視覚確認

UI 変更を含む作業では、Storybook 起動して視覚確認を Tomoya 側で実施:

- 既存 stories の regression なし
- 新規 stories の描画確認

## 実例の参照先

各規模の実例:

**大規模**:

- `sidebar-routing-unification`（8 コミット / Phase 全体設計書 + Step 4 詳細）
- `sidebar-3-mode-structure`（7 コミット / Phase 全体設計書 + 各 Step 詳細）

**中規模**:

- （未実施、将来 `feature-colocation-migration` が該当予定）

**小規模**:

- フォローアップ作業群（typo 修正、namespace 追加、etc.）

詳細は `docs/projects/` 配下の各 project ディレクトリを参照。
