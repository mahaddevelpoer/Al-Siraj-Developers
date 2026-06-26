-- AL SIRAJ DEVELOPERS - Native SVG town map shapes
CREATE TABLE IF NOT EXISTS public.town_map_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_id TEXT UNIQUE NOT NULL,
  town_name TEXT NOT NULL,
  property_type TEXT,
  property_number TEXT,
  shape_type TEXT NOT NULL DEFAULT 'plot',
  label TEXT,
  status TEXT DEFAULT 'available',
  geometry_json JSONB DEFAULT '{}'::jsonb,
  style_json JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  client_write_id TEXT,
  sync_status TEXT DEFAULT 'synced',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_town_map_shapes_town ON public.town_map_shapes (town_name, sort_order);
CREATE INDEX IF NOT EXISTS idx_town_map_shapes_property ON public.town_map_shapes (town_name, property_type, property_number);

ALTER TABLE public.town_map_shapes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS town_map_shapes_read_all ON public.town_map_shapes;
CREATE POLICY town_map_shapes_read_all ON public.town_map_shapes
FOR SELECT USING (true);

DROP POLICY IF EXISTS town_map_shapes_write_all ON public.town_map_shapes;
CREATE POLICY town_map_shapes_write_all ON public.town_map_shapes
FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'town_map_shapes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.town_map_shapes;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
