/**
 * ドラッグ作成の種別タブ（記録 / 予定）の挙動。
 *
 * 既定は end_at 判定のまま、過去スロットだけ Plan へ切り替えられ、未来スロットでは
 * 記録タブが disabled になることを、実際の作成 mutation の呼び分けまで含めて確認する。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveTimeblockKindChoice } from '@/features/timeblock';

import { useInlineCreateStore } from '../../../../../stores/useInlineCreateStore';
import { InlineActivityPalette } from './InlineActivityPalette';

const createPlanMutate = vi.hoisted(() => vi.fn());
const createRecordMutate = vi.hoisted(() => vi.fn());

vi.mock('@/features/timeblock', async () => {
  const domain = await vi.importActual<
    typeof import('@/features/timeblock/domain/timeblock-destination')
  >('@/features/timeblock/domain/timeblock-destination');

  return {
    resolveTimeblockDestination: domain.resolveTimeblockDestination,
    resolveTimeblockKindChoice: domain.resolveTimeblockKindChoice,
    collectTimeblockLaneItems: () => [],
    hasTimeblockLaneConflict: () => false,
    useTimeblockWriteMutations: () => ({
      createPlan: { mutate: createPlanMutate },
      createRecord: { mutate: createRecordMutate },
    }),
  };
});

// アクティビティ一覧は 1 件だけ返す。選択でそのまま作成へ進む。
vi.mock('@/features/activities', () => ({
  ActivityIcon: () => null,
  getCategoryColorClasses: () => null,
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  ActivityQuickSelector: ({
    open,
    onSelect,
    hint,
  }: {
    open: boolean;
    onSelect: (id: string, name: string) => void;
    hint?: React.ReactNode;
  }) =>
    open ? (
      <div>
        {hint}
        <button type="button" onClick={() => onSelect('activity-1', '開発')}>
          開発
        </button>
      </div>
    ) : null,
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: (selector: (s: { timezone: string; timeFormat: string }) => unknown) =>
    selector({ timezone: 'UTC', timeFormat: '24h' }),
}));
vi.mock('@/lib/stores/useShellStore', () => ({
  useShellStore: Object.assign(
    (selector: (s: { activeSheet: null }) => unknown) => selector({ activeSheet: null }),
    { getState: () => ({ activeSheet: null }), use: { openActivityCreateModal: () => vi.fn() } },
  ),
}));
vi.mock('../../../../../hooks/accessibility/useHapticFeedback', () => ({
  useHapticFeedback: () => ({ tap: vi.fn(), impact: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'ja',
  useTranslations: () => (key: string) => key,
}));

/** 指定日の 9:00-10:00 を pendingSelection に置く */
function setSelection(date: Date) {
  useInlineCreateStore.setState({
    pendingSelection: {
      date,
      startHour: 9,
      startMinute: 0,
      endHour: 10,
      endMinute: 0,
    },
  });
}

function pastDay() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d;
}

function futureDay() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d;
}

describe('InlineActivityPalette の種別タブ', () => {
  beforeEach(() => {
    createPlanMutate.mockClear();
    createRecordMutate.mockClear();
    useInlineCreateStore.setState({ pendingSelection: null });
  });

  it('過去スロットの既定は記録で、そのまま選ぶと Record を作る', () => {
    setSelection(pastDay());
    render(<InlineActivityPalette hourHeight={60} />);

    expect(screen.getByRole('button', { name: 'event.preview.record' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '開発' }));

    expect(createRecordMutate).toHaveBeenCalledTimes(1);
    expect(createPlanMutate).not.toHaveBeenCalled();
  });

  it('過去スロットで予定タブへ切り替えると Plan を作る', () => {
    setSelection(pastDay());
    render(<InlineActivityPalette hourHeight={60} />);

    fireEvent.click(screen.getByRole('button', { name: 'event.preview.plan' }));
    expect(useInlineCreateStore.getState().pendingSelection?.kind).toBe('plan');

    fireEvent.click(screen.getByRole('button', { name: '開発' }));

    expect(createPlanMutate).toHaveBeenCalledTimes(1);
    expect(createRecordMutate).not.toHaveBeenCalled();
  });

  it('未来スロットでは記録タブが選べず、選択すると Plan を作る', () => {
    setSelection(futureDay());
    render(<InlineActivityPalette hourHeight={60} />);

    expect(
      screen.getByRole('button', {
        name: 'event.preview.record — activitySelector.recordUnavailableFuture',
      }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '開発' }));

    expect(createPlanMutate).toHaveBeenCalledTimes(1);
    expect(createRecordMutate).not.toHaveBeenCalled();
  });

  it('未来スロットは kind=record を要求されても Plan へ倒す（DT005）', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(resolveTimeblockKindChoice(future, 'record')).toEqual({
      kind: 'plan',
      canRecord: false,
    });
  });
});
