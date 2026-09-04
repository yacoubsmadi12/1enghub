-- Normalize every existing foreign key that points to assets, including constraints
-- created by older VM deployments or extensions not present in the current schema.
DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT
      ns.nspname AS table_schema,
      cls.relname AS table_name,
      con.conname AS constraint_name,
      string_agg(format('%I', attr.attname), ', ' ORDER BY key_position.ordinality) AS columns
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_class referenced_cls ON referenced_cls.oid = con.confrelid
    JOIN pg_namespace referenced_ns ON referenced_ns.oid = referenced_cls.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key_position(attnum, ordinality) ON true
    JOIN pg_attribute attr ON attr.attrelid = cls.oid AND attr.attnum = key_position.attnum
    WHERE con.contype = 'f'
      AND referenced_ns.nspname = 'public'
      AND referenced_cls.relname = 'assets'
      AND NOT (ns.nspname = 'public' AND cls.relname = 'audit_events')
    GROUP BY ns.nspname, cls.relname, con.conname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', constraint_row.table_schema, constraint_row.table_name, constraint_row.constraint_name);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.assets(id) ON DELETE CASCADE', constraint_row.table_schema, constraint_row.table_name, constraint_row.constraint_name, constraint_row.columns);
  END LOOP;
END $$;
