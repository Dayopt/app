import { describe, expect, it } from 'vitest';

import { summarizeMergeChecks } from './merge-check-status.mjs';

const HEAD_SHA = 'a'.repeat(40);
const REPOSITORY = 'Dayopt/dayopt';
const FAILURE_COMPLETED_AT = '2026-07-29T03:59:27Z';
const SUCCESS_STARTED_AT = '2026-07-29T04:07:40Z';
const TARGET_URL = 'https://github.com/Dayopt/dayopt/actions/runs/30421412179';

function auditFailure(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'CheckRun',
    completedAt: FAILURE_COMPLETED_AT,
    conclusion: 'FAILURE',
    name: 'Audit Vercel metadata (trusted)',
    status: 'COMPLETED',
    workflowName: 'Production Config Audit',
    ...overrides,
  };
}

function auditStatusContext(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'StatusContext',
    context: 'Production Config Audit',
    startedAt: SUCCESS_STARTED_AT,
    state: 'SUCCESS',
    targetUrl: TARGET_URL,
    ...overrides,
  };
}

function trustedStatus(overrides: Record<string, unknown> = {}) {
  return {
    context: 'Production Config Audit',
    created_at: SUCCESS_STARTED_AT,
    description: 'Vercel metadata matches the Production contract',
    state: 'success',
    target_url: TARGET_URL,
    ...overrides,
  };
}

function input(
  checks: Array<Record<string, unknown>>,
  options: {
    auditRun?: Record<string, unknown> | null;
    headRefOid?: string;
    sha?: string;
    statuses?: Array<Record<string, unknown>>;
  } = {},
) {
  return {
    repository: REPOSITORY,
    pr: {
      headRefName: 'codex/mcp-plan-track-learn',
      headRefOid: options.headRefOid ?? HEAD_SHA,
      statusCheckRollup: checks,
    },
    commitStatus: {
      sha: options.sha ?? HEAD_SHA,
      statuses: options.statuses ?? [trustedStatus()],
    },
    auditRun:
      options.auditRun === undefined
        ? {
            actor: { id: 211590452, login: 't3-nico', type: 'User' },
            conclusion: 'success',
            event: 'workflow_dispatch',
            head_branch: 'codex/mcp-plan-track-learn',
            head_sha: HEAD_SHA,
            html_url: TARGET_URL,
            name: 'Production Config Audit',
            path: '.github/workflows/production-config-audit.yml',
            repository: { full_name: REPOSITORY },
            status: 'completed',
            triggering_actor: { id: 211590452, login: 't3-nico', type: 'User' },
            workflow_id: 317107354,
          }
        : options.auditRun,
  };
}

describe('summarizeMergeChecks', () => {
  it('supersedes only the exact failed trusted audit after a later exact-head success', () => {
    expect(
      summarizeMergeChecks(
        input([
          auditFailure(),
          auditStatusContext(),
          { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
        ]),
      ),
    ).toEqual({
      failedChecks: 0,
      pendingChecks: 0,
      successChecks: 2,
      supersededTrustedAuditFailures: 1,
    });
  });

  it.each([
    ['older', '2026-07-29T03:50:00Z'],
    ['same time', FAILURE_COMPLETED_AT],
    ['missing', undefined],
  ])('keeps the failure when the trusted success timestamp is %s', (_label, createdAt) => {
    const status = trustedStatus({ created_at: createdAt });
    const rollup = auditStatusContext({ startedAt: createdAt });
    expect(
      summarizeMergeChecks(input([auditFailure(), rollup], { statuses: [status] })).failedChecks,
    ).toBe(1);
  });

  it('fails closed when any same-context status has a missing timestamp', () => {
    expect(
      summarizeMergeChecks(
        input([auditFailure(), auditStatusContext()], {
          statuses: [trustedStatus(), trustedStatus({ created_at: undefined })],
        }),
      ).failedChecks,
    ).toBe(1);
  });

  it.each(['pending', 'failure', 'error'])(
    'keeps the failure when the latest status is %s',
    (state) => {
      expect(
        summarizeMergeChecks(
          input([auditFailure(), auditStatusContext()], {
            statuses: [trustedStatus({ state })],
          }),
        ).failedChecks,
      ).toBe(1);
    },
  );

  it.each(['CANCELLED', 'TIMED_OUT'])('never supersedes a %s CheckRun', (conclusion) => {
    expect(
      summarizeMergeChecks(input([auditFailure({ conclusion }), auditStatusContext()]))
        .failedChecks,
    ).toBe(1);
  });

  it('keeps unrelated failures while superseding the exact trusted audit failure', () => {
    expect(
      summarizeMergeChecks(
        input([
          auditFailure(),
          auditStatusContext(),
          {
            __typename: 'CheckRun',
            conclusion: 'FAILURE',
            name: 'Unit tests',
            workflowName: 'CI',
          },
        ]),
      ).failedChecks,
    ).toBe(1);
  });

  it.each([
    ['similar name', { name: 'Audit Vercel metadata' }],
    ['different workflow', { workflowName: 'CI' }],
    ['different type', { __typename: 'StatusContext', state: 'FAILURE' }],
  ])('does not supersede a %s check', (_label, override) => {
    expect(
      summarizeMergeChecks(input([auditFailure(override), auditStatusContext()])).failedChecks,
    ).toBe(1);
  });

  it.each([
    ['wrong SHA', { sha: 'b'.repeat(40) }],
    ['wrong description', { statuses: [trustedStatus({ description: 'Audit contract changed' })] }],
    ['wrong target', { statuses: [trustedStatus({ target_url: 'https://example.com/run/1' })] }],
    [
      'rollup mismatch',
      {
        checks: [
          auditFailure(),
          auditStatusContext({ targetUrl: 'https://github.com/Dayopt/dayopt/actions/runs/1' }),
        ],
      },
    ],
  ])('fails closed for %s', (_label, options) => {
    const checks =
      'checks' in options
        ? (options.checks as Array<Record<string, unknown>>)
        : [auditFailure(), auditStatusContext()];
    expect(summarizeMergeChecks(input(checks, options)).failedChecks).toBe(1);
  });

  it.each([
    ['missing run', null],
    ['wrong actor', { actor: { id: 1, login: 'other', type: 'User' } }],
    ['wrong triggering actor', { triggering_actor: { id: 1, login: 'other', type: 'User' } }],
    ['wrong workflow', { workflow_id: 1 }],
    ['wrong event', { event: 'pull_request_target' }],
    ['wrong head', { head_sha: 'b'.repeat(40) }],
    ['failed run', { conclusion: 'failure' }],
    ['wrong run URL', { html_url: 'https://github.com/Dayopt/dayopt/actions/runs/1' }],
  ])('requires trusted Actions provenance for %s', (_label, override) => {
    const defaultRun = input([]).auditRun as Record<string, unknown>;
    const auditRun = override === null ? null : { ...defaultRun, ...override };
    expect(
      summarizeMergeChecks(input([auditFailure(), auditStatusContext()], { auditRun }))
        .failedChecks,
    ).toBe(1);
  });

  it('preserves ordinary success, pending, failure, and empty-rollup counts', () => {
    expect(
      summarizeMergeChecks(
        input(
          [
            { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
            { __typename: 'CheckRun', conclusion: '', status: 'IN_PROGRESS' },
            { __typename: 'StatusContext', state: 'ERROR' },
          ],
          { statuses: [] },
        ),
      ),
    ).toEqual({
      failedChecks: 1,
      pendingChecks: 1,
      successChecks: 1,
      supersededTrustedAuditFailures: 0,
    });
    expect(summarizeMergeChecks(input([], { statuses: [] })).successChecks).toBe(0);
  });

  it('requires the later success to follow every matching failed run', () => {
    expect(
      summarizeMergeChecks(
        input(
          [
            auditFailure(),
            auditFailure({ completedAt: '2026-07-29T04:08:00Z' }),
            auditStatusContext(),
          ],
          { statuses: [trustedStatus()] },
        ),
      ).failedChecks,
    ).toBe(2);
  });
});
