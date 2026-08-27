---
status: frozen
date: 2026-08-27
---

# 指揮台の既定を Opus に降ろし、Fable は発火条件つきの「メタ把握」へ回す

## 背景・当時の前提

`.claude/rules/orchestration.md` は指揮台を「最上位 tier（Fable / Opus）」と定義し、可逆な采配も Fable 決定 + User opt-out を既定にしていた。実運用では、日々の編成・監視・merge 統合はすでに機械と手続きで固められている（pre-push フック / `branch:finish` / CI 4 層 / `lane-protocol.md`）。一方で「そもそもこの issue を今解く必要があるか」「複数 issue が同じ根本原因から出ていないか」といった問題設定そのものへの疑いは、日常の指揮ループの中では起きにくかった。

起点は [#2451](https://github.com/Dayopt/dayopt/issues/2451)。当初案は Strategy Council（User + Fable + ChatGPT）を新設し、Strategic State（8 項目）と Operating Intent を新しい成果物として持たせる二層構造だった。

## 決定と理由

**層は 2 つに保つ。日々の指揮は Opus 指揮台、その一段上のメタ把握は User + Fable の「発火条件つきの会話」とする。** 評議会・常任席・新しい定例は作らない。

- **指揮台の既定を Opus にする** — 手続きが機械で固められている以上、日常の指揮は Opus で足りる。指揮台は役割の名前でありモデルの名前ではない
- **Fable は常設しない** — 発火条件は 4 つ: User の違和感 / クロスレビューが 2 round を超えて収束しない / レーン報告の矛盾が独立再検証で解けない / 複数 issue が同根・前提が実測で崩れた・不可逆判断が保留中。前 2 者は、repo の履歴上「指揮台の判断が最も効いた場面」が収束判定（[PR #1820](https://github.com/Dayopt/dayopt/pull/1820) の 30 ラウンド事故の後に codify）と矛盾報告の独立再検証（2026-08-11 に誤報を潰して不要な revert を回避）だったことから、実績のある価値だけを escalation として残したもの
- **`docs/state.md` を 1 ページ上限で置く** — 方向 / 優先の順序 / 生きている賭け（撤退条件つき）/ やらないこと / 前提。**現在地と当週キューは書かず盤面 issue を参照する**。1 ページ上限そのものを装置とし、「埋める」ではなく「選ぶ」を強制する
- **効力は朝編成での User 合意で確定する** — state.md は観測コンテンツであり、それ自体は指揮台への指示にならない（盤面 §1 と同じ前例、instruction source boundary を維持）
- **メタ把握の会話からレーンへ直接 `send_message` しない** — 指示経路は指揮台 1 本のまま。2 本になると同一 PR への二重 `branch:finish`（2026-08-11 に実発生）と同型の事故が起きる

## 却下した選択肢と、なぜ捨てたか

- **Strategy Council という枠** — 組織・評議会は「記憶を共有できない複数の人間」を調整するための形。ここでは repo が共有記憶で人間は 1 人であり、調整すべき他者がいない。枠だけが残って儀式化する
- **ChatGPT の常任席** — 独立した目の価値自体は本物だが、(a) repo へ書けないため更新役にすると User が書記になり [#1788](https://github.com/Dayopt/dayopt/issues/1788)（手動更新依存で陳腐化）の経路をたどる (b) 2026-09 の private 化で素の読み取りが切れる。規約に書けば維持対象になり、読めなくなった日に「壊れたもの」になる。書かなければ、使わなくなった日に静かに消える。外部の目が欲しい時に読ませるのは自由とし、体制には入れない
- **Strategic State の 8 項目スキーマ** — 8 項目のうち 5 項目（Current Reality / Direction / Priorities / Constraints / 判断結果）は盤面 issue・`strategy.md`・`decision-principles.md`・`decisions.md` に正本がある。純増分は Assumptions / Bets / Stop の 3 項目だけで、丸ごと作ると二重管理になり更新されない側から腐る
- **Operating Intent という中間成果物** — 優先の順序がそのまま Intent。中間概念を挟むほど翻訳作業が生まれる
- **`state.md` に「今週の最優先」を持たせる** — 盤面 §1 と同じ内容になり二重管理になる。state.md は順序（何が何に従属するか）だけを持ち、タスク粒度の当週キューは盤面 §1 を正本とする
- **STATE.md の教訓を根拠に文書化そのものを却下する** — 当初この案に対して「STATE.md と同じ失敗」と評価したが、分解すると STATE.md が死んだ原因は「文書だから」ではなく変化速度のミスマッチ（merge のたびに動く進捗を snapshot したから 1 merge ごとに古くなった）。週〜月でしか動かない認識を手動維持するのは `strategy.md` が既にやって腐っていない。**変化速度で置き場所を分ける**なら遅い層の独立文書は成立する

## 影響・やること

- `.claude/rules/orchestration.md` — 指揮台の定義を「既定 Opus」へ、§メタ把握（User + Fable）を新設、権限表を「指揮台決定 + opt-out」へ、朝編成に state.md の読み合わせを接続
- `.claude/rules/ai-behavior.md` — tier 表で Main（Opus）と Fable（メタ把握）を分離
- `CLAUDE.md` §協働のかたち — 2 層の境界を 1 行で明示
- `docs/state.md` 新設、`docs/README.md` の地図・ルーティング・変化速度の説明を更新、docs-guard の `ROOT_STOCK_FILES` に追加
- `.claude/skills/morning-digest/SKILL.md` — 「指揮台（Fable、着席時）」「Fable 向け蒸留」をモデル名から役割名へ
- `.claude/rules/workflow.md` §main checkout の役割 は変更不要（元からモデル名を含まない役割定義）

## 再検討トリガー(何が起きたらこの判断を見直すか)

- **2〜4 週の運用で、`docs/state.md` の更新が編成判断を一度も変えなかった** → state.md を畳む
- **Opus 指揮台でクロスレビューの往復が収束しにくくなった（3 round 超が常態化）、または矛盾報告の独立再検証が機能しなくなった** → 指揮台を Fable へ戻すか、escalation の範囲を広げる
- **メタ把握の発火が週 1 回を大きく超える** → Opus の裁量か発火条件の設計を疑う（境界が細かすぎる）
- **外部の目が定常的に必要だと実測できた** → その時点で初めて ChatGPT の運用を規約化する
