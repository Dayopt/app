import { describe, expect, it } from 'vitest';

import { parseTimeblockParam, serializeTimeblockParam } from './inspector-url';

describe('inspector URL', () => {
  it.each([
    ['plan', 'plan-1'],
    ['record', 'record-1'],
  ] as const)('%sを往復できる', (kind, id) => {
    const serialized = serializeTimeblockParam(id, kind);
    expect(parseTimeblockParam(serialized)).toEqual({ timeblockId: id, kind });
  });

  it.each(['', 'plan:', 'record:', 'unknown:id'])('不正な値を拒否する: %s', (value) => {
    expect(parseTimeblockParam(value)).toBeNull();
  });
});
