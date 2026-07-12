import { describe, expect, it } from 'vitest';

import { ConfirmDayButton, RecordPlanButton } from './TimeblockRecordActions';

describe('TimeblockRecordActions', () => {
  it('日次確定とワンタップ記録の UI を提供する', () => {
    expect(RecordPlanButton).toBeTypeOf('function');
    expect(ConfirmDayButton).toBeTypeOf('function');
  });
});
