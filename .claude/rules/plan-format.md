# Plan Format 規律

Claude が実装 plan を提示する時の必須セクション。`/plan-review` から起動される `plan-critic` / `plan-fact-checker` が前提とする format でもある。

mandate: **長期で負債を作らない・最適であり続ける**。launch clock を考慮しない。「あとで直す」は退路ではなく、**やらない** を選ぶ。

## plan 粒度 ≠ PR 粒度

本ファイルの規律は **1 plan の中身**に対するもので、**merge の単位**には及ばない。「複数目的を 1 plan に詰めない」「ついで refactor は別 plan に切る」は維持するが、**独立した複数の plan / Step を同一 branch・1 PR で出荷するのが標準**（[workflow.md §PR 粒度](./workflow.md#pr-粒度)）。

「別 plan に切る」は「別 PR に切る」を意味しない。

## 必須セクション

以下を順に書く。順序は固定。空にしない（該当なしの場合も「該当なし」と明記）。

### Goal（1 文）

何を達成するか。1 文で言い切る。複数目的を 1 plan に詰めない。

### Minimum Viable Approach

この目標を達成する**最小**の手順は何か。「ついで」「将来」「綺麗に」を排除した骨格を先に書く。骨格を書いた上で、追加するなら理由を併記。

### Step Count（UI フローを含む plan のみ）

`CLAUDE.md` §シンプルルール のルール 3「Google Calendar / Toggl より一手少なく」の実装。**ユーザー操作のフローを新設・変更する plan では必須**、それ以外では省略する（省略は違反ではない。plan-critic / plan-fact-checker も無い場合を欠落として扱わない）。

同じ目的を達成するのに要する**ユーザー操作の数**を、比較対象と並べる。

| フロー          | Google Calendar | Toggl | Dayopt（この plan 後） |
| --------------- | --------------- | ----- | ---------------------- |
| 予定を 1 件置く | 4 手            | —     | 2 手                   |

- 数えるのは「クリック / タップ / キー入力の確定」。ページ遷移や待ち時間は数えない
- 比較対象に該当機能が無い場合は `—` と書く。無い機能で勝っても手数の主張にはならない
- **同数または多い場合は、その理由を書く**。書けないなら approach を作り直す。速度・起動の速さ・操作数・画面の少なさは機能要件（[strategy.md](../../docs/business/strategy.md) §4-9）

### Reversibility Table

各ステップに以下のいずれかをタグ付けする:

- `[minutes]` — git revert で 5 分以内に戻せる（純粋な code 変更、設定値変更）
- `[hours]` — DB migration / 環境変数 / 外部設定を含むが 1 日以内に rollback できる
- `[days]` — データ移行を伴い rollback コストが大きい
- `[irreversible]` — URL / public ID / schema 公開 / 外部 webhook の契約変更など、後から変えられない

`[irreversible]` を含む step は **強い正当化** が必要。代替案を検討した上で採用する根拠を書く。

### Existing Code to Reuse

新規実装に使う既存の関数 / util / コンポーネント / hook の path を列挙。例:

- `apps/product/src/lib/i18n/request.ts` の `getTranslations` を流用
- `apps/product/src/features/tags/server/service.ts` の `mergeTags` を呼ぶ

「再利用できるのに新規書きする」提案は plan-critic に under-engineering / idiom 違反として REVISE される。

### What I'm Not Doing

やらないことと、その理由。以下は明示的に却下する:

- 「ついでに refactor」— 別 plan に切る（同じ PR に載せるかは §plan 粒度 ≠ PR 粒度 の通り別問題）
- 「念のため abstraction」— 3+ 呼び出し点が現在無いなら入れない
- 「将来必要かもしれないので」— YAGNI

「やらないこと」を書く行為そのものが、scope creep の自己検出として機能する。

## 該当しない場合の扱い

- 1 ファイル 1 行の typo 修正のように本当に trivial な変更は、Goal + 1 行の Approach のみで済ませて良い
- ただし不可逆要素（URL 変更、削除）が含まれる場合は規模に関わらず Reversibility Table を必須

## CLAUDE.md との関係

CLAUDE.md の「ワークフロー」が Explore → Plan → Code → Commit の流れを規定する。本ファイルは **Plan ステップで Claude が出力する文書の format** を規定する。重複しない。
