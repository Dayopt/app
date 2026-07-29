import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'finish-branch.sh'),
  'utf8',
);

describe('finish-branch merge safety contract', () => {
  it('binds status evidence and both merge paths to the inspected head SHA', () => {
    expect(script).toContain('headRefOid');
    expect(script).toContain('commits/$HEAD_OID/status');
    expect(script).toContain('--match-head-commit "$HEAD_OID"');
    expect(script).toContain('-f sha="$HEAD_OID"');
  });

  it('resolves the trusted status target to its GitHub Actions run', () => {
    expect(script).toContain('actions/runs/$AUDIT_RUN_ID');
    expect(script).toContain('--argjson auditRun "$AUDIT_RUN_JSON"');
  });
});
