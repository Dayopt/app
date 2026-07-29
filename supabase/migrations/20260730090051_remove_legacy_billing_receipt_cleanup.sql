-- The app moved to the v2 cleanup result before any external activation.
-- Remove the count-only RPC so service-role callers cannot bypass has_more.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION public.cleanup_billing_account_deletion_terminal_receipts_v1(INTEGER);

COMMIT;
