import { beforeEach, describe, expect, it } from 'vitest';

import {
  migrateCalendarDisplayModeState,
  useCalendarDisplayModeStore,
} from '../useCalendarDisplayModeStore';

describe('useCalendarDisplayModeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCalendarDisplayModeStore.setState({ mobileWeekDisplayMode: 'recorded' });
  });

  it('既定値は recorded（記録主役の方針に合わせる）', () => {
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('recorded');
  });

  it('setMobileWeekDisplayMode でモードを切り替えられる', () => {
    useCalendarDisplayModeStore.getState().setMobileWeekDisplayMode('planned');
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('planned');

    useCalendarDisplayModeStore.getState().setMobileWeekDisplayMode('recorded');
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('recorded');
  });

  it('v1 の logged を recorded へ移行する', () => {
    expect(migrateCalendarDisplayModeState({ mobileWeekDisplayMode: 'logged' }, 1)).toEqual({
      mobileWeekDisplayMode: 'recorded',
    });
  });

  it('表示モードだけを永続化し、action は保存しない', () => {
    useCalendarDisplayModeStore.getState().setMobileWeekDisplayMode('planned');

    expect(JSON.parse(localStorage.getItem('calendar-display-mode-storage') ?? '')).toEqual({
      state: { mobileWeekDisplayMode: 'planned' },
      version: 2,
    });
  });
});
