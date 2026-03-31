import { useState } from 'react';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  defaultDropAnimation,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GripVertical } from 'lucide-react';
import { createPortal } from 'react-dom';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { SectionCard } from '@/components/common/SectionCard';

import type { DragEndEvent, DropAnimation, Modifier } from '@dnd-kit/core';
import type { AnimateLayoutChanges } from '@dnd-kit/sortable';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_CATEGORIES = [
  {
    key: 'family',
    label: '家族',
    desc: '祖先は15〜50人の血縁グループで暮らしていた。家族の絆は安心感の土台',
    importance: 8,
    text: '家族との時間を大切にする',
  },
  {
    key: 'romance',
    label: '結婚・恋愛',
    desc: 'パートナーとの安定した関係は心身の健康に直結',
    importance: 6,
    text: '',
  },
  {
    key: 'parenting',
    label: '子育て',
    desc: 'かつては部族全体で子育てしていた。現代の孤立した子育てとのギャップ',
    importance: 5,
    text: '',
  },
  {
    key: 'friends',
    label: '友人・対人関係',
    desc: 'ダンバー数（約150人）が人間関係の自然な上限。深い付き合いは5人程度',
    importance: 7,
    text: '月1で友人と食事',
  },
  {
    key: 'career',
    label: 'キャリア・仕事',
    desc: '狩猟採集時代に「仕事」と「生活」の境界はなかった',
    importance: 9,
    text: '深い集中時間を確保する',
  },
  {
    key: 'selfGrowth',
    label: '自己成長',
    desc: '新しいスキルの習得は生存に直結していた',
    importance: 8,
    text: '毎日30分の読書',
  },
  {
    key: 'leisure',
    label: '余暇・レジャー',
    desc: '遊びは脳の発達と社会的結束に不可欠だった',
    importance: 6,
    text: '',
  },
  {
    key: 'spirituality',
    label: 'スピリチュアリティ',
    desc: '畏敬の念は人類に普遍的な感情。自然への畏怖が原型',
    importance: 4,
    text: '',
  },
  {
    key: 'community',
    label: 'コミュニティ',
    desc: '部族への帰属感は安全と安心の源泉',
    importance: 5,
    text: '',
  },
  {
    key: 'health',
    label: '健康',
    desc: '食事・睡眠・運動のすべてが祖先の環境と大きくミスマッチ',
    importance: 10,
    text: '7時間睡眠、週3運動',
  },
  {
    key: 'environment',
    label: '環境',
    desc: '自然との接触は心身の回復に不可欠（バイオフィリア仮説）',
    importance: 5,
    text: '',
  },
  {
    key: 'art',
    label: '芸術',
    desc: '創造的表現は4万年以上前から続く人類の本能',
    importance: 3,
    text: '',
  },
];

const MOCK_KEYWORDS = [
  { key: 'integrity', label: '誠実さ' },
  { key: 'courage', label: '勇気' },
  { key: 'curiosity', label: '好奇心' },
  { key: 'compassion', label: '思いやり' },
  { key: 'creativity', label: '創造性' },
  { key: 'gratitude', label: '感謝' },
  { key: 'freedom', label: '自由' },
  { key: 'fairness', label: '公正さ' },
  { key: 'perseverance', label: '忍耐' },
  { key: 'humor', label: 'ユーモア' },
  { key: 'honesty', label: '正直' },
  { key: 'independence', label: '自立' },
  { key: 'kindness', label: '優しさ' },
  { key: 'leadership', label: 'リーダーシップ' },
  { key: 'learning', label: '学び' },
  { key: 'love', label: '愛' },
  { key: 'loyalty', label: '忠誠' },
  { key: 'humility', label: '謙虚さ' },
  { key: 'adventure', label: '冒険' },
  { key: 'stability', label: '安定' },
  { key: 'trust', label: '信頼' },
  { key: 'wisdom', label: '知恵' },
  { key: 'beauty', label: '美' },
  { key: 'cooperation', label: '協力' },
  { key: 'discipline', label: '規律' },
  { key: 'empathy', label: '共感' },
  { key: 'tolerance', label: '寛容' },
  { key: 'wellbeing', label: '健やかさ' },
  { key: 'hope', label: '希望' },
  { key: 'justice', label: '正義' },
  { key: 'peace', label: '平和' },
  { key: 'joy', label: '喜び' },
  { key: 'responsibility', label: '責任' },
  { key: 'respect', label: '敬意' },
  { key: 'safety', label: '安全' },
  { key: 'service', label: '奉仕' },
  { key: 'simplicity', label: 'シンプルさ' },
  { key: 'achievement', label: '達成' },
  { key: 'teamwork', label: 'チームワーク' },
  { key: 'tradition', label: '伝統' },
  { key: 'diversity', label: '多様性' },
  { key: 'environmentalism', label: '環境保護' },
  { key: 'connection', label: 'つながり' },
  { key: 'growth', label: '成長' },
  { key: 'passion', label: '情熱' },
  { key: 'playfulness', label: '遊び心' },
  { key: 'balance', label: 'バランス' },
  { key: 'challenge', label: '挑戦' },
  { key: 'contribution', label: '貢献' },
  { key: 'authenticity', label: 'ありのまま' },
];

const MOCK_RANKED = ['integrity', 'curiosity', 'discipline', 'growth', 'balance'];

const KEYWORD_MAP = Object.fromEntries(MOCK_KEYWORDS.map((k) => [k.key, k.label]));

const AI_STYLES = [
  { value: 'coach', label: 'コーチ', desc: '気づきを促す質問をしてくれる。押し付けない。' },
  {
    value: 'analyst',
    label: 'アナリスト',
    desc: 'データに基づく客観的な分析。数値やトレンドで説明。',
  },
  { value: 'friendly', label: 'フレンドリー', desc: 'カジュアルで親しみやすい。励ましベース。' },
  { value: 'custom', label: 'カスタム', desc: '自分でスタイルの指示を書く。' },
];

// ─────────────────────────────────────────────────────────
// DnD Config (matching TagSortableTree pattern)
// ─────────────────────────────────────────────────────────

const animateLayoutChanges: AnimateLayoutChanges = ({ isSorting, wasDragging }) =>
  isSorting || wasDragging ? false : true;

const measuring = { droppable: { strategy: MeasuringStrategy.Always } };

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      {
        opacity: 0,
        transform: CSS.Transform.toString({
          ...transform.final,
          x: transform.final.x + 5,
          y: transform.final.y + 5,
        }),
      },
    ];
  },
  easing: 'ease-out',
  sideEffects({ active }) {
    active.node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: defaultDropAnimation.duration,
      easing: defaultDropAnimation.easing,
    });
  },
};

const adjustTranslate: Modifier = ({ transform }) => ({ ...transform, y: transform.y - 25 });

// ─────────────────────────────────────────────────────────
// Sub-components (pure UI, no tRPC)
// ─────────────────────────────────────────────────────────

function ImportanceDots({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Importance">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((dot) => (
        <button
          key={dot}
          type="button"
          className={cn(
            'size-3 rounded-full transition-colors',
            dot <= value ? 'bg-primary' : 'bg-muted',
          )}
          onClick={() => onChange(dot)}
          aria-label={`${dot}`}
        />
      ))}
    </div>
  );
}

function SortableRankItem({ id, rank, label }: { id: string; rank: number; label: string }) {
  const {
    attributes,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, animateLayoutChanges });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setDroppableNodeRef}
      style={style}
      className={cn(
        'border-border bg-background flex items-center gap-3 rounded-lg border px-3 py-2',
        isDragging && 'opacity-40',
      )}
    >
      <span className="text-muted-foreground w-5 text-right text-sm">{rank}</span>
      <span ref={setDraggableNodeRef} className="text-foreground flex-1 text-sm">
        {label}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Interactive Story Components
// ─────────────────────────────────────────────────────────

function ValuesSettingsDemo() {
  const [categories, setCategories] = useState(MOCK_CATEGORIES);

  return (
    <SectionCard title="価値評定スケール">
      <p className="text-muted-foreground mb-4 text-sm">
        ACTに基づく12領域の価値観を記録してください。AIがパーソナライズされたアドバイスをする際の最重要コンテキストになります。
      </p>
      <div className="space-y-4">
        {categories.map((cat, idx) => (
          <div key={cat.key} className="border-border rounded-2xl border p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h4 className="text-foreground text-sm font-normal">{cat.label}</h4>
                <p className="text-muted-foreground text-xs">{cat.desc}</p>
              </div>
              <ImportanceDots
                value={cat.importance}
                onChange={(v) => {
                  const updated = [...categories];
                  updated[idx] = { ...cat, importance: v };
                  setCategories(updated);
                }}
              />
            </div>
            <Textarea
              value={cat.text}
              onChange={(e) => {
                const updated = [...categories];
                updated[idx] = { ...cat, text: e.target.value };
                setCategories(updated);
              }}
              placeholder="この分野で大切にしていることを書いてください..."
              className="min-h-[60px] resize-none text-sm"
              rows={2}
              aria-label={`${cat.label} notes`}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ValueRankingDemo() {
  const [ranked, setRanked] = useState<string[]>(MOCK_RANKED);
  const [activeId, setActiveId] = useState<string | null>(null);
  const selectedSet = new Set(ranked);
  const MAX = 10;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = ranked.indexOf(active.id as string);
      const newIndex = ranked.indexOf(over.id as string);
      setRanked(arrayMove(ranked, oldIndex, newIndex));
    }
  };

  return (
    <SectionCard title="価値観キーワードランキング">
      <p className="text-muted-foreground mb-4 text-sm">
        共感するキーワードを選び、大事な順にトップ10を並べてください。
      </p>

      {/* Keyword Grid */}
      <div>
        <div className="text-muted-foreground mb-2 text-xs">
          {ranked.length} / {MAX} 選択中
        </div>
        <div className="flex flex-wrap gap-2">
          {MOCK_KEYWORDS.map(({ key, label }) => {
            const isSelected = selectedSet.has(key);
            const isDisabled = !isSelected && ranked.length >= MAX;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setRanked(ranked.filter((k) => k !== key));
                  } else if (ranked.length < MAX) {
                    setRanked([...ranked, key]);
                  }
                }}
                disabled={isDisabled}
                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Badge variant={isSelected ? 'primary' : 'outline'}>{label}</Badge>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ranked List */}
      {ranked.length > 0 && (
        <div className="mt-4">
          <div className="text-muted-foreground mb-2 text-xs">ドラッグして並び替え</div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={measuring}
            onDragStart={({ active }) => {
              setActiveId(active.id as string);
              document.body.style.setProperty('cursor', 'grabbing');
            }}
            onDragEnd={(event) => {
              document.body.style.setProperty('cursor', '');
              handleDragEnd(event);
            }}
            onDragCancel={() => {
              setActiveId(null);
              document.body.style.setProperty('cursor', '');
            }}
          >
            <SortableContext items={ranked} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {ranked.map((keyword, index) => (
                  <SortableRankItem
                    key={keyword}
                    id={keyword}
                    rank={index + 1}
                    label={KEYWORD_MAP[keyword] ?? keyword}
                  />
                ))}
              </div>
            </SortableContext>
            {typeof document !== 'undefined' &&
              createPortal(
                <DragOverlay dropAnimation={dropAnimationConfig} modifiers={[adjustTranslate]}>
                  {activeId ? (
                    <div className="border-primary bg-background flex items-center gap-3 rounded-lg border-2 px-3 py-2 shadow-sm">
                      <span className="text-foreground flex-1 text-sm">
                        {KEYWORD_MAP[activeId] ?? activeId}
                      </span>
                      <GripVertical className="text-muted-foreground size-4" />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
          </DndContext>
        </div>
      )}
    </SectionCard>
  );
}

function AIStyleDemo() {
  const [style, setStyle] = useState('coach');

  return (
    <SectionCard title="AIコミュニケーションスタイル">
      <p className="text-muted-foreground mb-4 text-sm">
        チャットパネルでAIがどのようにコミュニケーションするかを選んでください。
      </p>
      <RadioGroup value={style} onValueChange={setStyle} className="space-y-3">
        {AI_STYLES.map((s) => (
          <Label
            key={s.value}
            htmlFor={`ai-style-${s.value}`}
            className={cn(
              'border-border flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors',
              style === s.value && 'border-primary bg-state-active',
            )}
          >
            <RadioGroupItem value={s.value} id={`ai-style-${s.value}`} className="mt-0.5" />
            <div className="flex-1">
              <div className="text-foreground text-sm font-normal">{s.label}</div>
              <div className="text-muted-foreground text-xs">{s.desc}</div>
            </div>
          </Label>
        ))}
      </RadioGroup>

      {style === 'custom' && (
        <div className="mt-4">
          <Label htmlFor="custom-prompt" className="text-sm font-normal">
            カスタムスタイルの指示
          </Label>
          <Textarea
            id="custom-prompt"
            placeholder="AIにどのようにコミュニケーションしてほしいか書いてください..."
            className="mt-2 min-h-[80px] resize-none text-sm"
            rows={3}
          />
        </div>
      )}
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────
// Meta & Stories
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/PersonalizationPatterns',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** 全セクション一覧（12領域 + ランキング + AIスタイル） */
export const AllSections: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl space-y-8">
      <ValuesSettingsDemo />
      <ValueRankingDemo />
      <AIStyleDemo />
    </div>
  ),
};

/** 価値評定スケール（12領域 × 重要度ドットバー） */
export const ValuesScale: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl">
      <ValuesSettingsDemo />
    </div>
  ),
};

/** キーワードランキング（選択 + DnD並び替え） */
export const KeywordRanking: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl">
      <ValueRankingDemo />
    </div>
  ),
};

/** AIコミュニケーションスタイル */
export const AIStyle: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl">
      <AIStyleDemo />
    </div>
  ),
};

/** 保存中状態 */
export const SavingState: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl space-y-8">
      <SectionCard title="価値評定スケール">
        <div className="border-border rounded-2xl border p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="text-foreground text-sm font-normal">健康</h4>
              <p className="text-muted-foreground text-xs">
                食事・睡眠・運動のすべてが祖先の環境と大きくミスマッチ
              </p>
            </div>
            <ImportanceDots value={10} onChange={() => {}} />
          </div>
          <Textarea
            value="7時間睡眠、週3運動"
            readOnly
            className="min-h-[60px] resize-none text-sm"
            rows={2}
            aria-label="Health notes"
          />
        </div>
      </SectionCard>

      <SectionCard title="価値観キーワードランキング">
        <div className="text-muted-foreground mb-2 text-xs">5 / 10 選択中</div>
        <div className="flex flex-wrap gap-2">
          {['誠実さ', '好奇心', '規律', '成長', 'バランス'].map((label) => (
            <Badge key={label} variant="primary">
              {label}
            </Badge>
          ))}
          {['勇気', '思いやり', '自由'].map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      </SectionCard>
    </div>
  ),
};
