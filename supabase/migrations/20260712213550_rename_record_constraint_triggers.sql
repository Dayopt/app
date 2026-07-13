-- ALTER TABLE ... RENAME CONSTRAINT does not rename the backing constraint
-- trigger name, so align the three remaining catalog names explicitly.
ALTER TRIGGER enforce_log_tag_owner ON public.records RENAME TO enforce_record_tag_owner;
ALTER TRIGGER enforce_log_plan_owner ON public.records RENAME TO enforce_record_plan_owner;
ALTER TRIGGER enforce_log_external_event_owner ON public.records
  RENAME TO enforce_record_external_event_owner;
