import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Search, Tag } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AuditEntry } from './_data/copywriting-audit';
import {
  allEntries,
  buttonSuru,
  CATEGORY_LABELS,
  errorNoRecovery,
  genericDestructive,
  hardcodedStrings,
  keigoEntries,
  negativePhrasing,
  vaguePlaceholders,
} from './_data/copywriting-audit';

const meta = {
  title: 'Patterns/Copywriting',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['docs-only'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

/** Before/After テーブルをレンダリング */
function AuditTable({ entries }: { entries: AuditEntry[] }) {
  // OK（既に正しい）エントリは除外
  const violations = entries.filter((e) => e.current !== e.proposed);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border border-b">
            <th className="py-2 text-left font-medium">ファイル</th>
            <th className="py-2 text-left font-medium">キー</th>
            <th className="py-2 text-left font-medium">Before</th>
            <th className="py-2 text-left font-medium">After</th>
            <th className="py-2 text-left font-medium">ルール</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {violations.map((entry, i) => (
            <tr key={`${entry.file}-${entry.key}-${i}`} className="border-border border-b">
              <td className="py-2 font-mono text-xs">{entry.file}</td>
              <td className="max-w-48 truncate py-2 font-mono text-xs">{entry.key}</td>
              <td className="text-destructive max-w-64 py-2">{entry.current}</td>
              <td className="text-success max-w-64 py-2">{entry.proposed}</td>
              <td className="py-2 text-xs">{entry.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div>
      <h1 className="mb-2 text-2xl font-medium">Copywriting Tone Guide</h1>
      <p className="text-muted-foreground mb-8">
        UIテキストのトーンルールと、現在の違反箇所の Before/After 一覧。
      </p>

      <div className="grid max-w-6xl gap-8">
        {/* トーンルール概要 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">トーンルール</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            丁寧だけどカジュアル。敬語は使わず体言止めを基本とする。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">#</th>
                  <th className="py-2 text-left font-medium">ルール</th>
                  <th className="py-2 text-left font-medium">NG</th>
                  <th className="py-2 text-left font-medium">OK</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2">1</td>
                  <td className="py-2 font-medium">敬語禁止（体言止め）</td>
                  <td className="text-destructive py-2">予定を削除しました</td>
                  <td className="text-success py-2">予定を削除した</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">2</td>
                  <td className="py-2 font-medium">専門用語禁止</td>
                  <td className="text-destructive py-2">クロノタイプ</td>
                  <td className="text-success py-2">あなたのリズム</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">3</td>
                  <td className="py-2 font-medium">主語省略</td>
                  <td className="text-destructive py-2">あなたのプロフィール</td>
                  <td className="text-success py-2">プロフィール</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">4</td>
                  <td className="py-2 font-medium">ポジティブ変換</td>
                  <td className="text-destructive py-2">データがありません</td>
                  <td className="text-success py-2">まだデータがない</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">5</td>
                  <td className="py-2 font-medium">ボタン: 動詞で開始</td>
                  <td className="text-destructive py-2">すべて既読にする</td>
                  <td className="text-success py-2">すべて既読に</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">6</td>
                  <td className="py-2 font-medium">エラー: 原因 + 対処</td>
                  <td className="text-destructive py-2">エラーが発生しました</td>
                  <td className="text-success py-2">問題が起きた。もう一度試して</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2">7</td>
                  <td className="py-2 font-medium">空状態: 場所 + 次</td>
                  <td className="text-destructive py-2">タグがありません</td>
                  <td className="text-success py-2">まだタグがない。最初のタグを作成</td>
                </tr>
                <tr>
                  <td className="py-2">8</td>
                  <td className="py-2 font-medium">プレースホルダー: 例</td>
                  <td className="text-destructive py-2">入力してください</td>
                  <td className="text-success py-2">例: 朝の Deep Work</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 統計サマリー */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">違反統計</h2>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([key, label]) => {
              const count = allEntries.filter(
                (e) => e.category === key && e.current !== e.proposed,
              ).length;
              return (
                <div key={key} className="border-border rounded-lg border p-4">
                  <div className="text-2xl font-medium">{count}</div>
                  <div className="text-muted-foreground text-sm">{label}</div>
                </div>
              );
            })}
            <div className="border-border rounded-lg border p-4">
              <div className="text-2xl font-medium">
                {allEntries.filter((e) => e.current !== e.proposed).length}
              </div>
              <div className="text-muted-foreground text-sm">合計</div>
            </div>
          </div>
        </section>

        {/* Before/After: 敬語 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Before/After: 敬語 / ます形</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            最多の違反カテゴリ。「〜しました」「〜してください」「〜されます」を体言止めに変換。
          </p>
          <AuditTable entries={keigoEntries} />
        </section>

        {/* Before/After: 空状態 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Before/After: 空状態・ネガティブ表現</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            「〜がありません」をポジティブに言い換え、次のアクションを示す。
          </p>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-destructive mb-2 text-xs font-medium">Before</p>
              <div className="border-border rounded-lg border py-6">
                <EmptyState
                  icon={Tag}
                  title="タグがありません"
                  description="タグを作成して、プランを整理しましょう。"
                  actionLabel="タグを作成"
                  onAction={() => {}}
                />
              </div>
            </div>
            <div>
              <p className="text-success mb-2 text-xs font-medium">After</p>
              <div className="border-border rounded-lg border py-6">
                <EmptyState
                  icon={Tag}
                  title="まだタグがない"
                  description="タグを作成してエントリーを整理"
                  actionLabel="タグを作成"
                  onAction={() => {}}
                />
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-destructive mb-2 text-xs font-medium">Before</p>
              <div className="border-border rounded-lg border py-6">
                <EmptyState
                  icon={Search}
                  title="検索結果がありません"
                  description="「ミーティング」に一致するプランは見つかりませんでした。キーワードを変えてお試しください。"
                  actions={<Button variant="outline">検索をクリア</Button>}
                />
              </div>
            </div>
            <div>
              <p className="text-success mb-2 text-xs font-medium">After</p>
              <div className="border-border rounded-lg border py-6">
                <EmptyState
                  icon={Search}
                  title="一致する結果がない"
                  description="「ミーティング」に一致するエントリーがない。キーワードを変えて試して"
                  actions={<Button variant="outline">検索をクリア</Button>}
                />
              </div>
            </div>
          </div>

          <AuditTable entries={negativePhrasing} />
        </section>

        {/* Before/After: エラーメッセージ */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Before/After: エラーメッセージ</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            何が起きたか + どうすればいいか。リカバリーアクションを必ず含める。
          </p>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-destructive mb-2 text-xs font-medium">Before</p>
              <div className="border-border rounded-lg border py-6">
                <ErrorState title="カレンダーの読み込みに失敗しました" onRetry={() => {}} />
              </div>
            </div>
            <div>
              <p className="text-success mb-2 text-xs font-medium">After</p>
              <div className="border-border rounded-lg border py-6">
                <ErrorState
                  title="カレンダーを読み込めなかった。もう一度試して"
                  onRetry={() => {}}
                />
              </div>
            </div>
          </div>

          <AuditTable entries={errorNoRecovery} />
        </section>

        {/* Before/After: プレースホルダー */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Before/After: プレースホルダー</h2>
          <p className="text-muted-foreground mb-4 text-sm">「〜を入力」ではなく入力例を示す。</p>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <p className="text-destructive text-xs font-medium">Before</p>
              <Input placeholder="表示名を入力" readOnly />
              <Input placeholder="メッセージを入力..." readOnly />
              <Input placeholder="タグ名を入力" readOnly />
              <Input placeholder="検索..." readOnly />
            </div>
            <div className="space-y-4">
              <p className="text-success text-xs font-medium">After</p>
              <Input placeholder="例: Taro" readOnly />
              <Input placeholder="例: ボタンが反応しない" readOnly />
              <Input placeholder="例: 仕事、勉強" readOnly />
              <Input placeholder="例: ミーティング、運動" readOnly />
            </div>
          </div>

          <AuditTable entries={vaguePlaceholders} />
        </section>

        {/* Before/After: ボタンラベル */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Before/After: ボタンラベル</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            「する」を省略。destructive は対象を明記。
          </p>

          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-destructive mb-4 text-xs font-medium">Before</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline">すべて既読にする</Button>
                <Button variant="outline">複製する</Button>
                <Button variant="outline">統合する</Button>
                <Button variant="destructive">削除</Button>
              </div>
            </div>
            <div>
              <p className="text-success mb-4 text-xs font-medium">After</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline">すべて既読に</Button>
                <Button variant="outline">複製</Button>
                <Button variant="outline">統合</Button>
                <Button variant="destructive">エントリーを削除</Button>
              </div>
            </div>
          </div>

          <h3 className="mb-2 font-medium">「する」省略</h3>
          <AuditTable entries={buttonSuru} />

          <h3 className="mt-6 mb-2 font-medium">汎用 destructive → 具体的</h3>
          <AuditTable entries={genericDestructive} />
        </section>

        {/* ハードコード文字列 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">ハードコード文字列</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            i18n を通さずソースコードに直書きされた日本語テキスト。トーン修正が必要。
          </p>
          <AuditTable entries={hardcodedStrings} />
        </section>

        {/* Do / Don't */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">Do / Don&apos;t</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border-success space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Do</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>体言止めで簡潔に</li>
                <li>エラーにはリカバリーを添える</li>
                <li>空状態で次のアクションを示す</li>
                <li>プレースホルダーに入力例を示す</li>
                <li>destructive ボタンに対象を明記</li>
                <li>ポジティブな言い回し</li>
              </ul>
            </div>
            <div className="border-destructive space-y-2 border-l-4 pl-4">
              <h3 className="font-medium">Don&apos;t</h3>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>「〜しました」「〜してください」</li>
                <li>「申し訳ございません」</li>
                <li>「〜に失敗しました」だけで終わる</li>
                <li>「データがありません」だけで放置</li>
                <li>「入力してください」のみのプレースホルダー</li>
                <li>文脈なしの「削除」ボタン</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 例外 */}
        <section className="bg-card border-border rounded-2xl border p-6">
          <h2 className="mb-4 text-lg font-medium">例外</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 text-left font-medium">対象</th>
                  <th className="py-2 text-left font-medium">理由</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-border border-b">
                  <td className="py-2 font-mono text-xs">email.json</td>
                  <td className="py-2">トランザクションメールは丁寧語を維持</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-mono text-xs">legal.json</td>
                  <td className="py-2">法的テキストは敬語が必要</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 font-mono text-xs">aria.* キー</td>
                  <td className="py-2">スクリーンリーダー用の説明文は現状維持</td>
                </tr>
                <tr>
                  <td className="py-2">toast 成功通知</td>
                  <td className="py-2">「〜した」（過去形）で統一。体言止めではない</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  ),
};
