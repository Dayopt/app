import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagEstimationFactor } from '../../../domain/tag-estimation-factor';

const queryResult = vi.hoisted(
  () =>
    ({ current: { data: undefined } }) as {
      current: { data: TagEstimationFactor[] | undefined };
    },
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    `${key}:${String(values?.duration ?? '')}`,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    statistics: {
      getTagEstimationFactors: {
        useQuery: () => queryResult.current,
      },
    },
  },
}));

const { EstimationFeedforward } = await import('../EstimationFeedforward');

beforeEach(() => {
  queryResult.current = {
    data: [{ tagId: 'tag-a', factor: 1.5, sampleCount: 4 }],
  };
});

describe('EstimationFeedforward', () => {
  it('Plan の作成・編集時に、係数を掛けた実時間を提示する', () => {
    render(<EstimationFeedforward destination="plan" tagId="tag-a" draftMinutes={30} />);

    // 1.5 * 30 = 45 分
    expect(screen.getByRole('status')).toHaveTextContent('recentActual:45m');
  });

  it('保存先が Record なら表示しない', () => {
    render(<EstimationFeedforward destination="record" tagId="tag-a" draftMinutes={30} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('タグ未選択なら表示しない', () => {
    render(<EstimationFeedforward destination="plan" tagId={null} draftMinutes={30} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('係数を持たないタグでは表示しない（n < 3 は server が返さない）', () => {
    render(<EstimationFeedforward destination="plan" tagId="tag-unknown" draftMinutes={30} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('draft の長さが 0 なら表示しない', () => {
    render(<EstimationFeedforward destination="plan" tagId="tag-a" draftMinutes={0} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('query が失敗しても ErrorState を出さず静かに消える', () => {
    // 失敗時は data が undefined。受動的なヒントなのでエラー表示はしない
    // （`.claude/rules/quality.md` の ErrorState 必須ルールに対する明示的な例外）
    queryResult.current = { data: undefined };

    render(<EstimationFeedforward destination="plan" tagId="tag-a" draftMinutes={30} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
