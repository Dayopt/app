-- Draft: establish a durable Google project/subject authority boundary before
-- any fenced application entrypoint is enabled. Move to migrations only after
-- upgrade, concurrency, and replay tests pass.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.calendar_authority_projects (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  project_key TEXT NOT NULL UNIQUE CHECK (
    project_key ~ '^[1-9][0-9]{5,29}$'
  ),
  oauth_client_id TEXT NOT NULL UNIQUE CHECK (
    oauth_client_id ~ '^[1-9][0-9]{5,29}-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$'
    AND pg_catalog.split_part(oauth_client_id, '-', 1) = project_key
  ),
  provisioned_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  activation_version INTEGER NOT NULL DEFAULT 0 CHECK (
    activation_version IN (0, 1)
  ),
  activated_at TIMESTAMPTZ,
  CONSTRAINT calendar_authority_projects_activation_shape CHECK (
    (activation_version = 0 AND activated_at IS NULL)
    OR (activation_version = 1 AND activated_at IS NOT NULL)
  )
);

REVOKE ALL ON TABLE private.calendar_authority_projects
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_authority_projects IS
  'One immutable canonical Google Cloud project number and matching web OAuth client plus an explicit roll-forward-only authority cutover state for this Dayopt database.';

CREATE TABLE private.calendar_authority_fences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key TEXT NOT NULL
    REFERENCES private.calendar_authority_projects(project_key) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (
    scope_kind IN ('project', 'subject', 'quarantine')
  ),
  provider_account_id TEXT,
  epoch BIGINT NOT NULL DEFAULT 0 CHECK (epoch >= 0),
  state TEXT NOT NULL DEFAULT 'ready' CHECK (
    state IN ('ready', 'pending')
  ),
  pending_operation_count INTEGER NOT NULL DEFAULT 0 CHECK (
    pending_operation_count >= 0
  ),
  ready_after_project_epoch BIGINT NOT NULL DEFAULT 0 CHECK (
    ready_after_project_epoch >= 0
  ),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT calendar_authority_fences_scope_shape CHECK (
    (
      scope_kind = 'subject'
      AND provider_account_id IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(provider_account_id)) BETWEEN 1 AND 255
    )
    OR (
      scope_kind IN ('project', 'quarantine')
      AND provider_account_id IS NULL
    )
  ),
  CONSTRAINT calendar_authority_fences_state_shape CHECK (
    (
      scope_kind = 'project'
      AND state = 'ready'
      AND pending_operation_count = 0
      AND ready_after_project_epoch = 0
    )
    OR (
      scope_kind IN ('subject', 'quarantine')
      AND (
        (state = 'ready' AND pending_operation_count = 0)
        OR (state = 'pending' AND pending_operation_count > 0)
      )
    )
  ),
  CONSTRAINT calendar_authority_fences_id_project_unique
    UNIQUE (id, project_key)
);

CREATE UNIQUE INDEX calendar_authority_fences_project_unique
  ON private.calendar_authority_fences(project_key)
  WHERE scope_kind = 'project';

CREATE UNIQUE INDEX calendar_authority_fences_subject_unique
  ON private.calendar_authority_fences(project_key, provider_account_id)
  WHERE scope_kind = 'subject';

CREATE UNIQUE INDEX calendar_authority_fences_quarantine_unique
  ON private.calendar_authority_fences(project_key)
  WHERE scope_kind = 'quarantine';

REVOKE ALL ON TABLE private.calendar_authority_fences
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_authority_fences IS
  'Project OAuth epochs and Google sub-scoped revoke fences. Quarantine covers unresolvable legacy authority.';

ALTER TABLE public.calendar_connections
  ADD COLUMN authority_fence_id UUID,
  ADD COLUMN authority_epoch BIGINT CHECK (
    authority_epoch IS NULL OR authority_epoch >= 0
  ),
  ADD COLUMN sync_sequence BIGINT NOT NULL DEFAULT 0 CHECK (
    sync_sequence >= 0
  ),
  ADD CONSTRAINT calendar_connections_authority_fence_fkey
    FOREIGN KEY (authority_fence_id)
    REFERENCES private.calendar_authority_fences(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT calendar_connections_authority_shape CHECK (
    (authority_fence_id IS NULL AND authority_epoch IS NULL)
    OR (authority_fence_id IS NOT NULL AND authority_epoch IS NOT NULL)
  );

COMMENT ON COLUMN public.calendar_connections.authority_fence_id IS
  'Google project and provider-account authority fence owned by this connection.';
COMMENT ON COLUMN public.calendar_connections.authority_epoch IS
  'Subject fence epoch captured when this connection authority became active.';
COMMENT ON COLUMN public.calendar_connections.sync_sequence IS
  'DB-issued monotonically increasing publication generation; only the latest started sync run may write mirrors, cursors, pruning, or connection sync status.';

ALTER TABLE private.calendar_revoke_outbox
  ADD COLUMN authority_fence_id UUID,
  ADD COLUMN authority_epoch BIGINT CHECK (
    authority_epoch IS NULL OR authority_epoch >= 0
  ),
  ADD CONSTRAINT calendar_revoke_outbox_authority_fence_fkey
    FOREIGN KEY (authority_fence_id)
    REFERENCES private.calendar_authority_fences(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT calendar_revoke_outbox_authority_shape CHECK (
    (authority_fence_id IS NULL AND authority_epoch IS NULL)
    OR (authority_fence_id IS NOT NULL AND authority_epoch IS NOT NULL)
  );

COMMENT ON COLUMN private.calendar_revoke_outbox.authority_fence_id IS
  'Subject or quarantine fence held pending until this ciphertext is settled.';
COMMENT ON COLUMN private.calendar_revoke_outbox.authority_epoch IS
  'Fence epoch in which this revoke operation was registered.';

CREATE TABLE private.calendar_revoke_operations (
  operation_id UUID PRIMARY KEY,
  project_fence_id UUID NOT NULL,
  subject_fence_id UUID NOT NULL,
  subject_fence_epoch BIGINT NOT NULL CHECK (subject_fence_epoch >= 0),
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_connection_id UUID NOT NULL,
  account_deletion_id UUID,
  account_deletion_item_kind TEXT CHECK (
    account_deletion_item_kind IS NULL
    OR account_deletion_item_kind IN ('connection', 'outbox')
  ),
  account_deletion_item_id UUID,
  operation_kind TEXT NOT NULL CHECK (
    operation_kind IN (
      'account_delete',
      'connection_save',
      'disconnect',
      'legacy_quarantine',
      'purge',
      'token_rotation',
      'token_rotation_recovery'
    )
  ),
  request_digest BYTEA NOT NULL CHECK (
    pg_catalog.octet_length(request_digest) = 32
  ),
  state TEXT NOT NULL CHECK (
    state IN (
      'pending',
      'revoke_guarded',
      'expiry_guarded',
      'revoked',
      'expired'
    )
  ),
  initial_result TEXT NOT NULL CHECK (
    initial_result IN ('enqueued', 'marked', 'missing', 'queued')
  ),
  active_lease_id UUID,
  active_lease_expires_at TIMESTAMPTZ,
  provider_attempt_started_at TIMESTAMPTZ,
  provider_attempt_outcome TEXT CHECK (
    provider_attempt_outcome IS NULL
    OR provider_attempt_outcome IN (
      'confirmed',
      'not_attempted',
      'unconfirmed'
    )
  ),
  provider_attempt_reason TEXT CHECK (
    provider_attempt_reason IS NULL
    OR provider_attempt_reason IN (
      'decrypt_failed',
      'source_expired'
    )
  ),
  guard_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT (pg_catalog.clock_timestamp() + INTERVAL '23 hours 59 minutes'),
  settled_at TIMESTAMPTZ,
  delete_after TIMESTAMPTZ,
  CONSTRAINT calendar_revoke_operations_project_fence_fkey
    FOREIGN KEY (project_fence_id)
    REFERENCES private.calendar_authority_fences(id)
    ON DELETE RESTRICT,
  CONSTRAINT calendar_revoke_operations_subject_fence_fkey
    FOREIGN KEY (subject_fence_id)
    REFERENCES private.calendar_authority_fences(id)
    ON DELETE RESTRICT,
  CONSTRAINT calendar_revoke_operations_outbox_identity_unique
    UNIQUE (operation_id, subject_fence_id, subject_fence_epoch),
  CONSTRAINT calendar_revoke_operations_expiry_order CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '23 hours 59 minutes'
  ),
  CONSTRAINT calendar_revoke_operations_account_delete_shape CHECK (
    (
      operation_kind = 'account_delete'
      AND account_deletion_id IS NOT NULL
      AND account_deletion_item_kind IS NOT NULL
      AND account_deletion_item_id IS NOT NULL
    )
    OR (
      operation_kind <> 'account_delete'
      AND account_deletion_id IS NULL
      AND account_deletion_item_kind IS NULL
      AND account_deletion_item_id IS NULL
      AND provider_attempt_started_at IS NULL
      AND provider_attempt_outcome IS NULL
      AND provider_attempt_reason IS NULL
    )
  ),
  CONSTRAINT calendar_revoke_operations_provider_attempt_shape CHECK (
    (
      provider_attempt_outcome IS NULL
      AND provider_attempt_reason IS NULL
    )
    OR (
      provider_attempt_outcome IN ('confirmed', 'unconfirmed')
      AND provider_attempt_started_at IS NOT NULL
      AND provider_attempt_reason IS NULL
    )
    OR (
      provider_attempt_outcome = 'not_attempted'
      AND provider_attempt_started_at IS NULL
      AND provider_attempt_reason IS NOT NULL
      AND state = 'expired'
      AND active_lease_id IS NULL
      AND active_lease_expires_at IS NULL
      AND guard_until IS NULL
      AND settled_at IS NOT NULL
      AND delete_after IS NOT NULL
    )
  ),
  CONSTRAINT calendar_revoke_operations_state_shape CHECK (
    (
      state = 'pending'
      AND (
        (
          active_lease_id IS NULL
          AND active_lease_expires_at IS NULL
        )
        OR (
          active_lease_id IS NOT NULL
          AND active_lease_expires_at IS NOT NULL
        )
      )
      AND settled_at IS NULL
      AND delete_after IS NULL
    )
    OR (
      state = 'revoke_guarded'
      AND guard_until IS NOT NULL
      AND active_lease_id IS NULL
      AND active_lease_expires_at IS NULL
      AND settled_at IS NULL
      AND delete_after IS NULL
    )
    OR (
      state = 'expiry_guarded'
      AND guard_until IS NOT NULL
      AND (
        (
          active_lease_id IS NULL
          AND active_lease_expires_at IS NULL
        )
        OR (
          active_lease_id IS NOT NULL
          AND active_lease_expires_at IS NOT NULL
        )
      )
      AND settled_at IS NULL
      AND delete_after IS NULL
    )
    OR (
      state IN ('revoked', 'expired')
      AND active_lease_id IS NULL
      AND active_lease_expires_at IS NULL
      AND guard_until IS NULL
      AND settled_at IS NOT NULL
      AND delete_after IS NOT NULL
      AND delete_after > settled_at
      AND delete_after <= settled_at + INTERVAL '90 days'
    )
  )
);

CREATE INDEX calendar_revoke_operations_unsettled_idx
  ON private.calendar_revoke_operations(state, expires_at, operation_id)
  WHERE state IN ('pending', 'revoke_guarded', 'expiry_guarded');

CREATE INDEX calendar_revoke_operations_retention_idx
  ON private.calendar_revoke_operations(delete_after, operation_id)
  WHERE delete_after IS NOT NULL;

CREATE INDEX calendar_revoke_operations_subject_idx
  ON private.calendar_revoke_operations(subject_fence_id, created_at, operation_id);

CREATE UNIQUE INDEX calendar_revoke_operations_account_delete_unique
  ON private.calendar_revoke_operations(
    account_deletion_id,
    account_deletion_item_kind,
    account_deletion_item_id
  )
  WHERE operation_kind = 'account_delete';

CREATE UNIQUE INDEX calendar_revoke_operations_active_account_item_unique
  ON private.calendar_revoke_operations(
    source_user_id,
    account_deletion_item_kind,
    account_deletion_item_id
  )
  WHERE operation_kind = 'account_delete'
    AND state IN ('pending', 'revoke_guarded', 'expiry_guarded');

REVOKE ALL ON TABLE private.calendar_revoke_operations
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_revoke_operations IS
  'Payload-free durable replay ledger for Calendar provider revocation; settled tombstones are retained at most 90 days.';

ALTER TABLE private.calendar_revoke_outbox
  ADD CONSTRAINT calendar_revoke_outbox_operation_fkey
  FOREIGN KEY (id, authority_fence_id, authority_epoch)
  REFERENCES private.calendar_revoke_operations(
    operation_id,
    subject_fence_id,
    subject_fence_epoch
  )
  ON DELETE RESTRICT
  NOT VALID;

CREATE TABLE private.calendar_authority_command_receipts (
  operation_id UUID PRIMARY KEY,
  command_kind TEXT NOT NULL CHECK (
    command_kind IN ('connection_save', 'token_rotation')
  ),
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  subject_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_connection_id UUID NOT NULL,
  resource_connection_id UUID NOT NULL,
  request_digest BYTEA NOT NULL CHECK (
    pg_catalog.octet_length(request_digest) = 32
  ),
  result TEXT NOT NULL CHECK (
    (command_kind = 'connection_save' AND result = 'saved')
    OR (command_kind = 'token_rotation' AND result = 'updated')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  delete_after TIMESTAMPTZ NOT NULL
    DEFAULT (pg_catalog.statement_timestamp() + INTERVAL '90 days'),
  CONSTRAINT calendar_authority_command_receipts_retention CHECK (
    delete_after > created_at
    AND delete_after <= created_at + INTERVAL '90 days'
  )
);

CREATE INDEX calendar_authority_command_receipts_retention_idx
  ON private.calendar_authority_command_receipts(delete_after, operation_id);

REVOKE ALL ON TABLE private.calendar_authority_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_authority_command_receipts IS
  'Immutable payload-free receipts for successful Calendar authority commands; retained at most 90 days.';

CREATE TABLE private.calendar_account_deletion_intents (
  user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  deletion_id UUID NOT NULL UNIQUE,
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'preparing' CHECK (
    state IN ('preparing', 'ready')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  ready_at TIMESTAMPTZ,
  sealed_operation_count INTEGER CHECK (
    sealed_operation_count IS NULL OR sealed_operation_count >= 0
  ),
  sealed_receipt_digest BYTEA CHECK (
    sealed_receipt_digest IS NULL
    OR pg_catalog.octet_length(sealed_receipt_digest) = 32
  ),
  CONSTRAINT calendar_account_deletion_intents_expiry_order CHECK (
    expires_at > started_at
    AND expires_at <= started_at + INTERVAL '15 minutes'
  ),
  CONSTRAINT calendar_account_deletion_intents_state_shape CHECK (
    (
      state = 'preparing'
      AND ready_at IS NULL
      AND sealed_operation_count IS NULL
      AND sealed_receipt_digest IS NULL
    )
    OR (
      state = 'ready'
      AND ready_at IS NOT NULL
      AND sealed_operation_count IS NOT NULL
      AND sealed_receipt_digest IS NOT NULL
    )
  )
);

CREATE INDEX calendar_account_deletion_intents_expiry_idx
  ON private.calendar_account_deletion_intents(expires_at, user_id);

REVOKE ALL ON TABLE private.calendar_account_deletion_intents
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_account_deletion_intents IS
  'Fail-closed account deletion boundary: preparation expires after 15 minutes, while an immutable ready seal remains resumable until auth.users deletion.';

CREATE TABLE private.calendar_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_fence_id UUID NOT NULL
    REFERENCES private.calendar_authority_fences(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_digest BYTEA NOT NULL UNIQUE CHECK (
    pg_catalog.octet_length(state_digest) = 32
  ),
  verifier_digest BYTEA NOT NULL CHECK (
    pg_catalog.octet_length(verifier_digest) = 32
  ),
  operation_id UUID NOT NULL UNIQUE,
  connection_id UUID NOT NULL UNIQUE,
  data_generation BIGINT NOT NULL CHECK (data_generation >= 0),
  project_epoch BIGINT NOT NULL CHECK (project_epoch >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  delete_after TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result TEXT CHECK (result IN ('saved', 'enqueued')),
  CONSTRAINT calendar_oauth_attempts_expiry_order CHECK (
    expires_at > created_at
    AND expires_at <= created_at + INTERVAL '10 minutes'
  ),
  CONSTRAINT calendar_oauth_attempts_retention_order CHECK (
    delete_after >= expires_at
    AND delete_after <= created_at + INTERVAL '24 hours'
  ),
  CONSTRAINT calendar_oauth_attempts_state_shape CHECK (
    (
      claimed_at IS NULL
      AND claim_expires_at IS NULL
      AND completed_at IS NULL
      AND result IS NULL
    )
    OR (
      claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND claim_expires_at > claimed_at
      AND completed_at IS NULL
      AND result IS NULL
    )
    OR (
      completed_at IS NOT NULL
      AND claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND claim_expires_at > claimed_at
      AND result IS NOT NULL
      AND completed_at >= claimed_at
      AND completed_at <= claim_expires_at
    )
  )
);

CREATE INDEX calendar_oauth_attempts_expiry_idx
  ON private.calendar_oauth_attempts(delete_after, id);

REVOKE ALL ON TABLE private.calendar_oauth_attempts
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.calendar_oauth_attempts IS
  'Server-side integrity boundary for one Google OAuth state, PKCE verifier, generation, project epoch, and save identity.';

CREATE FUNCTION private.clamp_calendar_revoke_operation_retention_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.expires_at := LEAST(
    NEW.expires_at,
    NEW.created_at + INTERVAL '23 hours 59 minutes'
  );

  IF NEW.settled_at IS NULL THEN
    NEW.delete_after := NULL;
  ELSE
    NEW.delete_after := LEAST(
      COALESCE(
        NEW.delete_after,
        NEW.settled_at + INTERVAL '90 days'
      ),
      NEW.settled_at + INTERVAL '90 days'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clamp_calendar_revoke_operation_retention_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER clamp_calendar_revoke_operation_retention
  BEFORE INSERT OR UPDATE OF created_at, expires_at, settled_at, delete_after
  ON private.calendar_revoke_operations
  FOR EACH ROW
  EXECUTE FUNCTION private.clamp_calendar_revoke_operation_retention_v1();

CREATE FUNCTION private.digest_calendar_authority_operation_v1(
  p_operation_kind TEXT,
  p_normalized_args JSONB
)
RETURNS BYTEA
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.sha256(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'envelopeVersion', 1,
        'operationKind', p_operation_kind,
        'normalizedArgs', p_normalized_args
      )::TEXT,
      'UTF8'
    )
  );
$$;

REVOKE ALL ON FUNCTION private.digest_calendar_authority_operation_v1(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
