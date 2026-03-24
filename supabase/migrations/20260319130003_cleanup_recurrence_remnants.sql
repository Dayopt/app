-- Clean up remaining recurrence artifacts (table and function)
-- that were missed in the initial recurrence removal migration.

DROP TABLE IF EXISTS entry_instances;
DROP FUNCTION IF EXISTS split_recurrence;
