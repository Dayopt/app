import { describe, expect, it } from 'vitest';
import { WEEKEND_TOGGLE_SHORTCUT_HELP } from './useWeekendToggleShortcut';

describe('useWeekendToggleShortcut', () => {
  it('should export shortcut help information', () => {
    expect(WEEKEND_TOGGLE_SHORTCUT_HELP).toBeDefined();
    expect(WEEKEND_TOGGLE_SHORTCUT_HELP.key).toBe('Cmd/Ctrl + W');
    expect(WEEKEND_TOGGLE_SHORTCUT_HELP.description).toBe('Toggle Weekend Display');
    expect(WEEKEND_TOGGLE_SHORTCUT_HELP.mac).toBe('⌘W');
    expect(WEEKEND_TOGGLE_SHORTCUT_HELP.windows).toBe('Ctrl+W');
  });
});
