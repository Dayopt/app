-- Restore explicit parent/child tag hierarchy from colon-based names.
-- Depth remains fixed at 2 levels: root tag -> child tag only.

ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.tags(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tags.parent_id IS
  'Parent tag ID for hierarchical organization. NULL means root level tag. Maximum nesting depth is 1 level.';

CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON public.tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_parent_sort_order
  ON public.tags(user_id, parent_id, sort_order);

ALTER TABLE public.tags
DROP CONSTRAINT IF EXISTS tags_user_id_name_unique;

DROP INDEX IF EXISTS public.tags_user_root_name_unique;
DROP INDEX IF EXISTS public.tags_user_parent_name_unique;

WITH missing_prefixes AS (
  SELECT
    t.user_id,
    split_part(t.name, ':', 1) AS prefix_name,
    MIN(t.sort_order) AS sort_order,
    MIN(t.created_at) AS created_at,
    MIN(t.updated_at) AS updated_at,
    (
      ARRAY_AGG(t.color ORDER BY t.sort_order, t.created_at, t.id)
      FILTER (WHERE t.color IS NOT NULL)
    )[1] AS color,
    (
      ARRAY_AGG(t.icon ORDER BY t.sort_order, t.created_at, t.id)
      FILTER (WHERE t.icon IS NOT NULL)
    )[1] AS icon
  FROM public.tags t
  WHERE t.is_active = true
    AND position(':' in t.name) > 0
  GROUP BY t.user_id, split_part(t.name, ':', 1)
),
prefixes_to_insert AS (
  SELECT mp.*
  FROM missing_prefixes mp
  LEFT JOIN public.tags existing
    ON existing.user_id = mp.user_id
   AND existing.name = mp.prefix_name
  WHERE existing.id IS NULL
)
INSERT INTO public.tags (
  user_id,
  name,
  color,
  icon,
  is_active,
  parent_id,
  sort_order,
  created_at,
  updated_at
)
SELECT
  user_id,
  prefix_name,
  color,
  icon,
  true,
  NULL,
  COALESCE(sort_order, 0),
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM prefixes_to_insert;

WITH colon_tags AS (
  SELECT
    child.id AS child_id,
    parent.id AS parent_id,
    substring(child.name from position(':' in child.name) + 1) AS child_name
  FROM public.tags child
  JOIN public.tags parent
    ON parent.user_id = child.user_id
   AND parent.name = split_part(child.name, ':', 1)
  WHERE child.is_active = true
    AND position(':' in child.name) > 0
)
UPDATE public.tags child
SET
  parent_id = colon_tags.parent_id,
  name = colon_tags.child_name,
  updated_at = now()
FROM colon_tags
WHERE child.id = colon_tags.child_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, parent_id
      ORDER BY sort_order, created_at, id
    ) - 1 AS new_sort_order
  FROM public.tags
  WHERE is_active = true
)
UPDATE public.tags t
SET
  sort_order = ranked.new_sort_order,
  updated_at = now()
FROM ranked
WHERE t.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS tags_user_root_name_unique
  ON public.tags(user_id, name)
  WHERE parent_id IS NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS tags_user_parent_name_unique
  ON public.tags(user_id, parent_id, name)
  WHERE parent_id IS NOT NULL AND is_active = true;

DROP TRIGGER IF EXISTS enforce_tag_hierarchy ON public.tags;
DROP FUNCTION IF EXISTS public.check_tag_hierarchy();

CREATE OR REPLACE FUNCTION public.check_tag_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.tags parent
      WHERE parent.id = NEW.parent_id
        AND parent.parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.';
    END IF;

    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A tag cannot be its own parent.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tag_hierarchy
BEFORE INSERT OR UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.check_tag_hierarchy();

DROP TRIGGER IF EXISTS enforce_tag_no_children_as_child ON public.tags;
DROP FUNCTION IF EXISTS public.check_tag_has_children();

CREATE OR REPLACE FUNCTION public.check_tag_has_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.tags child
      WHERE child.parent_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot move a tag with children to be a child of another tag.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tag_no_children_as_child
BEFORE UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.check_tag_has_children();

CREATE OR REPLACE FUNCTION public.batch_reorder_tags_hierarchy(
  p_user_id UUID,
  p_tag_ids UUID[],
  p_parent_ids UUID[],
  p_sort_orders INT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count INT;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  IF array_length(p_tag_ids, 1) IS DISTINCT FROM array_length(p_parent_ids, 1)
     OR array_length(p_tag_ids, 1) IS DISTINCT FROM array_length(p_sort_orders, 1) THEN
    RAISE EXCEPTION 'tag_ids, parent_ids and sort_orders must have the same length';
  END IF;

  UPDATE public.tags
  SET
    parent_id = batch.parent_id,
    sort_order = batch.new_order,
    updated_at = now()
  FROM unnest(p_tag_ids, p_parent_ids, p_sort_orders) AS batch(tag_id, parent_id, new_order)
  WHERE public.tags.id = batch.tag_id
    AND public.tags.user_id = p_user_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

DROP FUNCTION IF EXISTS public.get_child_tag_breakdown(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_child_tag_breakdown(
  p_user_id UUID,
  p_parent_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(tag_id UUID, tag_name TEXT, tag_color TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      child.id AS tag_id,
      child.name AS tag_name,
      COALESCE(child.color, 'indigo') AS tag_color,
      ROUND(SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60) / 60, 2)::DOUBLE PRECISION AS hours
    FROM public.entries e
    JOIN public.tags child ON child.id = e.tag_id
    WHERE e.user_id = p_user_id
      AND child.parent_id = p_parent_tag_id
      AND e.deleted_at IS NULL
      AND e.start_time IS NOT NULL
      AND e.end_time IS NOT NULL
      AND (p_start_date IS NULL OR e.start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.start_time < p_end_date)
    GROUP BY child.id, child.name, child.color
    ORDER BY hours DESC;
END;
$$;
