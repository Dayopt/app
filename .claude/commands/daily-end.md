# 日次振り返り

今日の作業を振り返って、セッションログと日記の2つを生成する。

## 1. 情報収集

- `git log --oneline --since="00:00" --all` で今日のコミットを取得
- `git diff --stat $(git log --since="00:00" --format=%H | tail -1)^..HEAD` で変更規模を把握
- 既存のセッションログがあれば `.storybook/docs/dev/sessions/` を確認

## 2. セッションログ（Claude Code向け）

出力先: `.storybook/docs/dev/sessions/YYYY-MM-DD.md`

以下の構造で、事実と規約だけを簡潔に書く。散文・感想・論評は一切不要。

```yaml
date: YYYY-MM-DD
commits: N
areas: [触った機能領域]

decisions:
  - 今日決めた設計判断（「何を選んだか」だけ。理由は不要）

conventions:
  - 以降ずっと守るルール（CLAUDE.md昇格候補）

breaking:
  - 廃止したファイル・API・パターン

learned:
  - 今日発見した技術的事実（フレームワークの挙動など）

tried_and_failed:
  - 試して不採用にしたアプローチ（同じ袋小路を防ぐ）

files_of_note:
  - path/to/file  # 変更意図や「削除候補」等のメモ

next:
  - [ ] 明日以降やること・未完了タスク
```

### フィールドの必須/optional

- **必須**: `date`, `commits`, `areas`, `decisions`, `next`
- **optional**: `conventions`, `breaking`, `learned`, `tried_and_failed`, `files_of_note`

該当がなければoptionalフィールドは省略する。空配列 `[]` で埋めない。

### latest.md へのコピー

セッションログを `YYYY-MM-DD.md` に書いた後、同じ内容を `sessions/latest.md` にコピーする。
CLAUDE.mdからのポインタが常に最新セッションを指すために必要。

## 3. 日記エントリ（開発者向け）

出力先: `.storybook/docs/product/journal/YYYY-MM.mdx`
（該当月ファイルの先頭エントリの直前に追記）

該当月ファイルが存在しない場合は新規作成する。テンプレート:

```mdx
import { Meta } from '@storybook/blocks';

<Meta title="Strategy/Journal/YYYY-MM" />

# YYYY年N月 Diary

---

（ここにエントリを書く）
```

以下の構造で書く。日本語で。

```markdown
## YYYY-MM-DD

### 一行サマリー（その日を一言で）

コミット数・変更規模・作業領域を含む導入段落。

#### やったこと

カテゴリごとに件数つきで箇条書き。
コミット全件列挙ではなく、意味のある単位にグルーピングする。

#### なぜ今日この作業をしたか

なぜその作業をしたか、なぜその選択をしたか。
2-3段落の散文で。セッションログの decisions の
「理由」部分をここに書く。

#### Claudeの所感

技術的な洞察や設計判断への評価を書く。
太字サブタイトル + 段落の形式で2-3個。
プロダクト・アーキテクチャ・開発プロセスの
観点から、その日の作業の意味を掘り下げる。
```

## ルール

- セッションログには主観を入れない。日記には入れていい
- セッションログの conventions と learned は特に丁寧に。月末のCLAUDE.md蒸留で最も参照される
- 日記の「やったこと」はコミット全件列挙ではなく、意味のある単位にグルーピングする
- 生成後、内容を確認してもらってから保存する
