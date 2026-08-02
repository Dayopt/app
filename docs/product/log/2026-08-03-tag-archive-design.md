---
status: frozen
date: 2026-08-03
---

# タグアーカイブと削除時の未分類化の設計方針を決めた（#1576）

## 背景・当時の前提

- タグは活動名・語彙そのものになるため、長期利用で終了した分類が増える。選択候補から隠しつつ過去の Plan / Record の意味を保つアーカイブが必要（#1576）
- 現状調査で判明した事実:
  - `plans.tag_id` / `records.tag_id` の FK は両方 `ON DELETE SET NULL` 定義済みなのに、アプリ層の `delete_blocks` strategy（`tag-association-strategy.ts`）が FK に到達する前に Plan / Record を物理削除しており、DB 契約と service 実装が食い違っていた
  - `is_active = false` はマージ RPC（`merge_tags_with_hierarchy`）がソースタグに書く「マージ済みの墓標」専用で、UI からのアーカイブ導線は存在しない
  - 統計の未分類集計は #1284 で実装済み（`tag_id` NULL と参照切れ ID を同じ未分類バケットに集約）
  - settings にタグ管理画面は無く、タグ管理の実体はカレンダー左サイドバーの tag-filter

## 決定と理由

1. **アーカイブ状態は `archived_at TIMESTAMPTZ` を新設**（`is_active` 転用はしない）
   - `is_active = false` は本番にマージ墓標として存在しうる。転用するとマージで消したはずのタグがアーカイブ一覧に蘇る
   - `archived_at` はアーカイブ日時を持ち、シンプルルール 5（2 週間触らなければ削除候補）の判定材料になる
2. **完全削除は「タグ行 DELETE + FK `SET NULL` に任せる」だけにする**
   - `delete_blocks` strategy を廃止し、時間データの連鎖削除を選択肢から消す。Plan / Record は残り未分類（`tag_id = NULL`）になる
3. **`reassign` strategy も廃止し、付け替えはマージに一本化**
   - 「別タグへ付け替えてから消す」はマージそのもの。削除ダイアログは「アーカイブ（推奨）/ 完全削除」の 2 択に絞る
4. **親をアーカイブしたら子も一緒にアーカイブ**。子だけ個別復元した場合、親がアーカイブ中なら root タグとして復元する
5. **名前の部分 unique index に `archived_at IS NULL` 条件を追加**し、アーカイブ済みタグは名前を占有しない。復元時の同名衝突はエラーでリネームを促す（自動サフィックスにしない）
6. **UI はカレンダーサイドバーに寄せる**。settings に新画面は作らず、サイドバー末尾の「アーカイブ済み」折りたたみセクション + 各タグ context menu の「アーカイブ」で完結させる（Google Calendar / Toggl より一手少なく）
7. **アーカイブ済みタグの新規付与は service 層で拒否**する（DB trigger には足さない。新規ロジックは TS 側というルールに従う）
8. **未使用タグ（関連ゼロ）は確認ダイアログなしで即削除する現行挙動を維持**

## 却下した選択肢と、なぜ捨てたか

- **`is_active` をアーカイブフラグに転用** — マージ墓標と意味が衝突し、アーカイブ一覧にマージ済みタグが混入する
- **時間データの連鎖削除（`delete_blocks`）の存続** — タグ整理で時間履歴を失う。#1576 の方針（時間データは削除しない）に反する
- **`reassign` strategy の存続** — マージと重複し、削除ダイアログが 3 択になって説明コストが上がる
- **settings にタグ管理画面を新設** — サイドバーの折りたたみセクションより手数が増える。管理実体が既にサイドバーにある
- **親アーカイブ時に子を root 昇格して親だけアーカイブ** — 「終了した分類はグループごと終わる」心的モデルに合わない
- **復元時の同名衝突を自動サフィックスで解決** — 暗黙リネームより明示エラーの方が語彙の一貫性を保てる

## 影響・やること

- migration: `tags.archived_at` 追加、部分 unique index 2 本と `check_tag_has_children` trigger に `archived_at IS NULL` 条件を追加
- service: `delete_blocks` / `reassign` の廃止（削除はタグ行 DELETE のみ）、archive / restore service の新設、Plan / Record 作成・更新時のアーカイブ済みタグ付与ガード
- UI: サイドバー tag-filter にアーカイブセクションと context menu 導線を追加。削除ダイアログを 2 択に改修
- 統計のタグ lookup（`statistics-fetchers.ts`）が `is_active` を絞っていない現行挙動を「アーカイブ済みタグ名を過去 Record で表示する」意図的設計に昇格させ、コメントを残す
- 旧コロン記法のグループ操作（`deleteGroup` / `renameGroup` / `ungroupTags`）は呼び出し元ゼロの残骸のため、同ブランチで削除する（DB RPC の drop はコード側削除の先行 deploy 後に別途）
- 進捗・実装チェックリストは issue #1576 で管理する
