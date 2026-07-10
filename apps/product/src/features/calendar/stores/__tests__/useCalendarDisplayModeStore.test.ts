import { beforeEach, describe, expect, it } from 'vitest';

import { useCalendarDisplayModeStore } from '../useCalendarDisplayModeStore';

describe('useCalendarDisplayModeStore', () => {
  beforeEach(() => {
    useCalendarDisplayModeStore.setState({ mobileWeekDisplayMode: 'logged' });
  });

  it('既定値は logged（記録主役の方針に合わせる）', () => {
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('logged');
  });

  it('setMobileWeekDisplayMode でモードを切り替えられる', () => {
    useCalendarDisplayModeStore.getState().setMobileWeekDisplayMode('planned');
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('planned');

    useCalendarDisplayModeStore.getState().setMobileWeekDisplayMode('logged');
    expect(useCalendarDisplayModeStore.getState().mobileWeekDisplayMode).toBe('logged');
  });
});
