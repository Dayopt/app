import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TagBadgeList } from '../TagBadgeList';

import type { Tag } from '../../types';

const PARENT: Tag = {
  id: 'parent',
  user_id: 'user-1',
  name: '仕事',
  color: 'blue',
  icon: 'briefcase',
  parent_id: null,
  sort_order: 0,
  is_active: true,
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:00:00.000Z',
};

const CHILD: Tag = {
  ...PARENT,
  id: 'child',
  name: '開発',
  icon: 'code',
  parent_id: PARENT.id,
};

describe('TagBadgeList grouped hierarchy', () => {
  it('親タグと小タグを同時に表示し、どちらも1クリックで選択できる', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<TagBadgeList tags={[PARENT, CHILD]} hierarchyMode="grouped" onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: '仕事' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '開発' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '仕事' }));
    expect(onSelect).toHaveBeenLastCalledWith(PARENT.id, PARENT.name);

    await user.click(screen.getByRole('button', { name: '開発' }));
    expect(onSelect).toHaveBeenLastCalledWith(CHILD.id, CHILD.name);
  });
});
