import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRUSTED_AUDIT_CHECK_NAME = 'Audit Vercel metadata (trusted)';
const TRUSTED_AUDIT_CONTEXT = 'Production Config Audit';
const TRUSTED_AUDIT_DESCRIPTION = 'Vercel metadata matches the Production contract';
const TRUSTED_AUDIT_WORKFLOW = 'Production Config Audit';
const TRUSTED_AUDIT_WORKFLOW_ID = 317107354;
const TRUSTED_AUDIT_WORKFLOW_PATH = '.github/workflows/production-config-audit.yml';
const TRUSTED_AUDIT_ACTOR = { id: 211590452, login: 't3-nico' };

function parseTimestamp(value) {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFailedCheck(check) {
  const conclusion = typeof check?.conclusion === 'string' ? check.conclusion.toLowerCase() : '';
  const state = typeof check?.state === 'string' ? check.state.toLowerCase() : '';
  return (
    conclusion === 'failure' ||
    conclusion === 'cancelled' ||
    conclusion === 'timed_out' ||
    state === 'failure' ||
    state === 'error'
  );
}

function isPendingCheck(check) {
  const status = typeof check?.status === 'string' ? check.status.toLowerCase() : '';
  const state = typeof check?.state === 'string' ? check.state.toLowerCase() : '';
  return (
    ['in_progress', 'queued', 'pending', 'waiting', 'requested'].includes(status) ||
    state === 'pending'
  );
}

function isSuccessfulCheck(check) {
  const conclusion = typeof check?.conclusion === 'string' ? check.conclusion.toLowerCase() : '';
  const state = typeof check?.state === 'string' ? check.state.toLowerCase() : '';
  return conclusion === 'success' || state === 'success';
}

function isTrustedAuditFailure(check) {
  return (
    check?.__typename === 'CheckRun' &&
    check.name === TRUSTED_AUDIT_CHECK_NAME &&
    check.workflowName === TRUSTED_AUDIT_WORKFLOW &&
    check.conclusion === 'FAILURE'
  );
}

function findTrustedAuditSuccess(input, failedAuditChecks) {
  const { auditRun, commitStatus, pr, repository } = input;
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    typeof pr?.headRefOid !== 'string' ||
    commitStatus?.sha !== pr.headRefOid ||
    !Array.isArray(commitStatus?.statuses)
  ) {
    return undefined;
  }

  const completedAt = failedAuditChecks.map((check) => parseTimestamp(check.completedAt));
  if (completedAt.some((timestamp) => timestamp === undefined)) return undefined;
  const latestFailure = Math.max(...completedAt);

  const statuses = commitStatus.statuses
    .filter((status) => status?.context === TRUSTED_AUDIT_CONTEXT)
    .map((status) => ({ status, createdAt: parseTimestamp(status.created_at) }));
  if (statuses.length === 0 || statuses.some(({ createdAt }) => createdAt === undefined)) {
    return undefined;
  }
  statuses.sort((left, right) => right.createdAt - left.createdAt);
  const latestStatus = statuses[0];
  if (!latestStatus || latestStatus.createdAt <= latestFailure) return undefined;

  const expectedTarget = new RegExp(
    `^https://github\\.com/${escapeRegExp(repository)}/actions/runs/[0-9]+$`,
  );
  if (
    latestStatus.status.state !== 'success' ||
    latestStatus.status.description !== TRUSTED_AUDIT_DESCRIPTION ||
    typeof latestStatus.status.target_url !== 'string' ||
    !expectedTarget.test(latestStatus.status.target_url)
  ) {
    return undefined;
  }

  if (
    auditRun?.repository?.full_name !== repository ||
    auditRun.name !== TRUSTED_AUDIT_WORKFLOW ||
    auditRun.path !== TRUSTED_AUDIT_WORKFLOW_PATH ||
    auditRun.workflow_id !== TRUSTED_AUDIT_WORKFLOW_ID ||
    auditRun.event !== 'workflow_dispatch' ||
    auditRun.status !== 'completed' ||
    auditRun.conclusion !== 'success' ||
    auditRun.head_sha !== pr.headRefOid ||
    auditRun.head_branch !== pr.headRefName ||
    auditRun.html_url !== latestStatus.status.target_url ||
    auditRun.actor?.id !== TRUSTED_AUDIT_ACTOR.id ||
    auditRun.actor?.login !== TRUSTED_AUDIT_ACTOR.login ||
    auditRun.actor?.type !== 'User' ||
    auditRun.triggering_actor?.id !== TRUSTED_AUDIT_ACTOR.id ||
    auditRun.triggering_actor?.login !== TRUSTED_AUDIT_ACTOR.login ||
    auditRun.triggering_actor?.type !== 'User'
  ) {
    return undefined;
  }

  const matchingRollup = pr.statusCheckRollup?.find(
    (check) =>
      check?.__typename === 'StatusContext' &&
      check.context === TRUSTED_AUDIT_CONTEXT &&
      check.state === 'SUCCESS' &&
      check.startedAt === latestStatus.status.created_at &&
      check.targetUrl === latestStatus.status.target_url,
  );
  return matchingRollup ? latestStatus.status : undefined;
}

export function summarizeMergeChecks(input) {
  const checks = Array.isArray(input?.pr?.statusCheckRollup) ? input.pr.statusCheckRollup : [];
  const failedAuditChecks = checks.filter(
    (check) => isFailedCheck(check) && isTrustedAuditFailure(check),
  );
  const trustedAuditSuccess =
    failedAuditChecks.length > 0 ? findTrustedAuditSuccess(input, failedAuditChecks) : undefined;
  const supersededAuditChecks = trustedAuditSuccess ? new Set(failedAuditChecks) : new Set();

  return {
    failedChecks: checks.filter(
      (check) => isFailedCheck(check) && !supersededAuditChecks.has(check),
    ).length,
    pendingChecks: checks.filter(isPendingCheck).length,
    successChecks: checks.filter(isSuccessfulCheck).length,
    supersededTrustedAuditFailures: supersededAuditChecks.size,
  };
}

async function readStandardInput() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

const isCli =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isCli) {
  try {
    const input = JSON.parse(await readStandardInput());
    process.stdout.write(`${JSON.stringify(summarizeMergeChecks(input))}\n`);
  } catch {
    process.stderr.write('merge check statusを解析できませんでした。\n');
    process.exitCode = 1;
  }
}
