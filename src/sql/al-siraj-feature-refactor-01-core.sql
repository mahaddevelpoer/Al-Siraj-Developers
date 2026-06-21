ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS town_id TEXT,
  ADD COLUMN IF NOT EXISTS town_name TEXT;

UPDATE public.users
SET town_name = COALESCE(NULLIF(users.town_name, ''), (SELECT "Town_Name" FROM public.towns WHERE "Town_Name" IS NOT NULL ORDER BY "Town_Name" LIMIT 1)),
    town_id = COALESCE(NULLIF(users.town_id, ''), (SELECT "Town_Name" FROM public.towns WHERE "Town_Name" IS NOT NULL ORDER BY "Town_Name" LIMIT 1))
WHERE role = 'accountant'
  AND (town_name IS NULL OR town_name = '' OR town_id IS NULL OR town_id = '');

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS length_ft NUMERIC,
  ADD COLUMN IF NOT EXISTS width_ft NUMERIC,
  ADD COLUMN IF NOT EXISTS area_sqft NUMERIC,
  ADD COLUMN IF NOT EXISTS resell_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_owner_name TEXT;

ALTER TABLE public.towns
  ADD COLUMN IF NOT EXISTS residential_plot_price NUMERIC,
  ADD COLUMN IF NOT EXISTS commercial_plot_price NUMERIC,
  ADD COLUMN IF NOT EXISTS residential_shop_price NUMERIC,
  ADD COLUMN IF NOT EXISTS commercial_shop_price NUMERIC;
