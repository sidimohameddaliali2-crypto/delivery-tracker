-- PostgreSQL target schema (draft) — customers, deliveries, menus/kitchen.
-- users, partners, bags and handoffs are minimal STUBS included only so the
-- foreign keys resolve; expand them in the next pass. Not applied anywhere.
--
-- Decisions driven by scripts/auditMongoForSqlMigration.js:
--   * deliveries.customer_id is nullable (3,100 legacy deliveries reference
--     customer codes that don't exist); code + name are kept as snapshots.
--   * menu_selection_meals.menu_item_id is nullable / ON DELETE SET NULL
--     (419 deleted menu items are still referenced); meal_name is authoritative.
--   * menu_selections.customer_id is NOT NULL — 234 unlinked records must be
--     relinked or removed BEFORE loading.
--   * amount_paid / discount become numeric (source has "1,552.00", "10.00%").
--   * menu_items.carbs (a dish name, not a number) becomes carb_name.
--   * handoffs are linked only via deliveries.handoff_id (no id array).

CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- lookups
CREATE TABLE meal_plans (
  code text PRIMARY KEY
);
INSERT INTO meal_plans (code) VALUES
  ('Standard'), ('Customized'), ('Premium'), ('Vegan'), ('Keto'), ('Paleo'), ('Bodybuilder'),
  ('Lean 2 Meal'), ('Lean 3 Meal'), ('Thrive 2 Meal'), ('Thrive 3 Meal'), ('Perform 2 Meal'), ('Perform 3 Meal');

-- ------------------------------------------------------------------ stubs
CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id      text UNIQUE,
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'viewer' CHECK (role IN
    ('super_admin','admin','manager','dispatcher','driver','store_keeper','viewer','yellowblock_user','kitchen')),
  first_name    text,
  last_name     text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partners (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id      text UNIQUE,
  business_name text NOT NULL,
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  menu_selection_enabled boolean NOT NULL DEFAULT false,
  preset_c      numeric(6,1) NOT NULL DEFAULT 0,
  preset_p      numeric(6,1) NOT NULL DEFAULT 0,
  preset_f      numeric(6,1) NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bags (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id      text UNIQUE,
  bag_code      text NOT NULL UNIQUE CHECK (bag_code = upper(btrim(bag_code))),
  status        text NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','in_use','maintenance','retired')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE handoffs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id      text UNIQUE,
  type          text NOT NULL DEFAULT 'van_handoff' CHECK (type IN ('van_handoff','kitchen_return')),
  van_id        bigint REFERENCES users(id),
  bike_id       bigint NOT NULL REFERENCES users(id),
  handoff_date  date NOT NULL,
  meeting_lat   numeric(9,6) NOT NULL,
  meeting_lng   numeric(9,6) NOT NULL,
  meeting_name  text,
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','van_arrived','bike_arrived','completed','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- customers
CREATE TABLE customers (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id               text UNIQUE,
  customer_code          text NOT NULL UNIQUE,
  email                  citext UNIQUE CHECK (email <> ''),
  cpf                    text,
  first_name             text,
  last_name              text,
  phone                  text,
  company                text,
  address                text,
  matter_subscription_id text UNIQUE CHECK (matter_subscription_id <> ''),
  partner_id             bigint REFERENCES partners(id) ON DELETE SET NULL,
  unlimited_meals        boolean NOT NULL DEFAULT false,
  meal_per_day           smallint NOT NULL DEFAULT 1 CHECK (meal_per_day BETWEEN 0 AND 5),
  breakfast_include      boolean NOT NULL DEFAULT false,
  snack_count            smallint NOT NULL DEFAULT 0 CHECK (snack_count >= 0),
  meal_plan              text REFERENCES meal_plans(code),
  macro_c                numeric(6,1) NOT NULL DEFAULT 0,
  macro_p                numeric(6,1) NOT NULL DEFAULT 0,
  macro_f                numeric(6,1) NOT NULL DEFAULT 0,
  weekend                boolean NOT NULL DEFAULT false,
  preferences            text,
  plan_start_date        date,
  cycle_duration         integer NOT NULL DEFAULT 0,
  amount_paid            numeric(12,2),
  discount_percent       numeric(5,2),
  -- cached geocode (was Customer.gpsLocation)
  gps_lat                numeric(9,6),
  gps_lng                numeric(9,6),
  gps_source             text CHECK (gps_source IN ('google','link','manual','unresolved')),
  gps_address            text,
  geocoded_at            timestamptz,
  -- Athleat / FileMaker sync
  data_source            text NOT NULL DEFAULT 'WebData',
  athleat_id             text,
  athleat_mod_id         text,
  athleat_synced_at      timestamptz,
  athleat_uuid           text,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_cpf_idx ON customers (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX customers_phone_idx ON customers (phone) WHERE phone IS NOT NULL;
CREATE INDEX customers_partner_idx ON customers (partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX customers_athleat_idx ON customers (athleat_id) WHERE athleat_id IS NOT NULL;

-- Was a comma-separated mealExclusion string plus allergies[] / dietaryRestrictions[].
CREATE TABLE customer_exclusions (
  customer_id bigint NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  term        text NOT NULL,
  kind        text NOT NULL DEFAULT 'exclusion' CHECK (kind IN ('exclusion','allergy','dietary')),
  PRIMARY KEY (customer_id, kind, term)
);

-- ------------------------------------------------------------- deliveries
CREATE TABLE deliveries (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id               text UNIQUE,
  customer_id            bigint REFERENCES customers(id) ON DELETE SET NULL,
  customer_code          text NOT NULL,
  customer_name          text NOT NULL,
  matter_subscription_id text,
  scheduled_time         timestamptz NOT NULL,
  delivered_time         timestamptz,
  driver_id              bigint REFERENCES users(id) ON DELETE SET NULL,
  route_order            integer,
  route_optimized_at     timestamptz,
  handoff_id             bigint REFERENCES handoffs(id) ON DELETE SET NULL,
  company                text NOT NULL DEFAULT 'Matter',
  other_company          text,
  type                   text NOT NULL DEFAULT 'Delivery' CHECK (type IN ('Delivery','Task','Collection')),
  task_type              text CHECK (task_type IN ('Bag Collection','Purchase','Inspection')),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','assigned','on_route','picked_up','delivered','failed','completed','collected')),
  delivery_type          text NOT NULL DEFAULT 'on-time' CHECK (delivery_type IN ('early','on-time','late')),
  late_minutes           integer NOT NULL DEFAULT 0,
  early_minutes          integer NOT NULL DEFAULT 0,
  completed_at           timestamptz,
  address                text,
  addr_label             text,
  addr_city              text,
  addr_area              text,
  addr_street            text,
  addr_building          text,
  addr_floor             text,
  addr_apartment         text,
  addr_status            text,
  location_type          text CHECK (location_type IN ('Villa','Apartment')),
  zone                   text,
  gps_lat                numeric(9,6),
  gps_lng                numeric(9,6),
  gps_link               text,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_scheduled_idx        ON deliveries (scheduled_time);
CREATE INDEX deliveries_driver_status_idx    ON deliveries (driver_id, status);
CREATE INDEX deliveries_driver_scheduled_idx ON deliveries (driver_id, scheduled_time);
CREATE INDEX deliveries_status_scheduled_idx ON deliveries (status, scheduled_time);
CREATE INDEX deliveries_customer_code_idx    ON deliveries (customer_code);
CREATE INDEX deliveries_customer_id_idx      ON deliveries (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX deliveries_company_zone_idx     ON deliveries (company, zone);
CREATE INDEX deliveries_matter_sub_idx       ON deliveries (matter_subscription_id) WHERE matter_subscription_id IS NOT NULL;
CREATE INDEX deliveries_driver_type_idx      ON deliveries (driver_id, type);

CREATE TABLE delivery_timeline (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id bigint NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status      text,
  at          timestamptz NOT NULL DEFAULT now(),
  notes       text
);
CREATE INDEX delivery_timeline_delivery_idx ON delivery_timeline (delivery_id, at);

CREATE TABLE delivery_proofs (
  delivery_id     bigint PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
  signature       text,
  bag_code        text,
  captured_at     timestamptz,
  lat             numeric(9,6),
  lng             numeric(9,6),
  address         text,
  notes           text,
  verified        boolean,
  delivery_method text
);
CREATE TABLE delivery_proof_images (
  delivery_id bigint NOT NULL REFERENCES delivery_proofs(delivery_id) ON DELETE CASCADE,
  position    smallint NOT NULL,
  url         text NOT NULL,
  PRIMARY KEY (delivery_id, position)
);

CREATE TABLE delivery_bag_assignments (
  delivery_id bigint PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
  bag_code    text,
  bag_id      bigint REFERENCES bags(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  assigned_by bigint REFERENCES users(id) ON DELETE SET NULL,
  returned_at timestamptz,
  status      text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','delivered','returned'))
);

CREATE TABLE delivery_collections (
  delivery_id         bigint PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
  collected_at        timestamptz,
  collected_photo_url text,
  no_bags_available   boolean NOT NULL DEFAULT false
);
CREATE TABLE delivery_collected_bags (
  delivery_id bigint NOT NULL REFERENCES delivery_collections(delivery_id) ON DELETE CASCADE,
  bag_code    text NOT NULL,
  PRIMARY KEY (delivery_id, bag_code)
);

CREATE TABLE delivery_change_flags (
  delivery_id     bigint PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
  active          boolean NOT NULL DEFAULT false,
  changed_at      timestamptz,
  changed_fields  text[] NOT NULL DEFAULT '{}',
  note            text,
  acknowledged_at timestamptz,
  acknowledged_by bigint REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE delivery_complaints (
  delivery_id       bigint PRIMARY KEY REFERENCES deliveries(id) ON DELETE CASCADE,
  details           text,
  complaint_type    text,
  remarks           text,
  resolved          boolean NOT NULL DEFAULT false,
  reported_at       timestamptz,
  compensation_type text CHECK (compensation_type IN ('refund','extra_day')),
  compensation_amount numeric(12,2),
  compensation_days   integer
);

CREATE TABLE delivery_changes (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id              text UNIQUE,
  customer_id           bigint REFERENCES customers(id) ON DELETE SET NULL,
  customer_code         text NOT NULL,
  customer_name         text NOT NULL,
  customer_phone        text,
  scheduled_date        date NOT NULL,
  changes               jsonb NOT NULL DEFAULT '{}',
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','failed','cancelled')),
  applied_at            timestamptz,
  applied_to_delivery_id bigint REFERENCES deliveries(id) ON DELETE SET NULL,
  reason                text,
  uploaded_by           bigint REFERENCES users(id) ON DELETE SET NULL,
  file_reference        text,
  match_confidence      integer NOT NULL DEFAULT 0,
  matching_fields       text[] NOT NULL DEFAULT '{}',
  range_batch_id        text,
  range_start_date      date,
  range_end_date        date,
  range_sequence        integer,
  range_count           integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_changes_date_status_idx ON delivery_changes (scheduled_date, status);
CREATE INDEX delivery_changes_batch_idx ON delivery_changes (range_batch_id, scheduled_date) WHERE range_batch_id IS NOT NULL;

-- ------------------------------------------------------------ menu items
CREATE TABLE menu_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id            text UNIQUE,
  athleat_id          text,
  item_date           date,
  meal_type           text NOT NULL CHECK (meal_type IN ('breakfast','main','snack')),
  meal_name           text NOT NULL,
  meal_plan           text REFERENCES meal_plans(code),
  description         text,
  ingredients         text,
  protein_source      text NOT NULL DEFAULT '',
  category            text NOT NULL DEFAULT '' CHECK (category IN ('WARM','COLD','')),
  intolerances        text NOT NULL DEFAULT '',
  garnish             text NOT NULL DEFAULT '',
  veg                 text,
  sauce               text,
  carb_name           text,           -- source field `carbs` (a dish name, not a number)
  portion_type        text NOT NULL DEFAULT '' CHECK (portion_type IN ('chicken','beef','fish','')),
  rotation_category   text NOT NULL DEFAULT '' CHECK (rotation_category IN ('main','sub','')),
  used_for_core_plan  boolean NOT NULL DEFAULT false,
  instructions        text,
  image_url           text,
  calories            numeric(7,1) NOT NULL DEFAULT 0,
  protein_g           numeric(6,1) NOT NULL DEFAULT 0,
  fat_g               numeric(6,1) NOT NULL DEFAULT 0,
  fiber_g             numeric(6,1) NOT NULL DEFAULT 0,
  is_vegan            boolean NOT NULL DEFAULT false,
  is_gluten_free      boolean NOT NULL DEFAULT false,
  is_available        boolean NOT NULL DEFAULT true,
  price               numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_date_type_idx ON menu_items (item_date, meal_type);
CREATE INDEX menu_items_plan_idx      ON menu_items (meal_plan);

CREATE TABLE menu_item_allergens (
  menu_item_id bigint NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  allergen     text NOT NULL,
  PRIMARY KEY (menu_item_id, allergen)
);

-- Supy-sourced ingredients per component (portion / carb / veg / sauce).
CREATE TABLE menu_item_ingredients (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_item_id bigint NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  component    text NOT NULL CHECK (component IN ('portion','carb','veg','sauce')),
  name         text NOT NULL,
  visible      boolean NOT NULL DEFAULT true
);
CREATE INDEX menu_item_ingredients_item_idx ON menu_item_ingredients (menu_item_id);

-- ---------------------------------------------------------- weekly menus
CREATE TABLE weekly_menus (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id                  text UNIQUE,
  title                     text NOT NULL,
  description               text,
  start_date                date NOT NULL,
  end_date                  date NOT NULL,
  share_token               text UNIQUE,
  share_created_at          timestamptz,
  share_expires_at          timestamptz,
  share_is_active           boolean NOT NULL DEFAULT true,
  is_published              boolean NOT NULL DEFAULT false,
  is_active                 boolean NOT NULL DEFAULT true,
  enable_completion_message boolean NOT NULL DEFAULT false,
  completion_message        text NOT NULL DEFAULT 'Your meal selections have been saved successfully.',
  -- default breakfast preset (was WeeklyMenu.breakfastPreset)
  bf_name                   text NOT NULL DEFAULT '',
  bf_c                      numeric(6,1) NOT NULL DEFAULT 0,
  bf_p                      numeric(6,1) NOT NULL DEFAULT 0,
  bf_f                      numeric(6,1) NOT NULL DEFAULT 0,
  bf_v                      numeric(6,1) NOT NULL DEFAULT 80,
  bf_is_large               boolean NOT NULL DEFAULT false,
  view_count                integer NOT NULL DEFAULT 0,
  created_by                bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX weekly_menus_range_idx  ON weekly_menus (start_date, end_date);
CREATE INDEX weekly_menus_status_idx ON weekly_menus (is_active, is_published);
-- selection_count is intentionally NOT stored: count menu_selections instead.

CREATE TABLE weekly_menu_plans (
  weekly_menu_id bigint NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  meal_plan      text NOT NULL REFERENCES meal_plans(code),
  PRIMARY KEY (weekly_menu_id, meal_plan)
);

-- Was meals[].{date, mealType, items[]}
CREATE TABLE weekly_menu_items (
  weekly_menu_id bigint NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  menu_date      date NOT NULL,
  meal_type      text NOT NULL CHECK (meal_type IN ('breakfast','main','snack')),
  menu_item_id   bigint NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  PRIMARY KEY (weekly_menu_id, menu_date, meal_type, menu_item_id)
);
CREATE INDEX weekly_menu_items_item_idx ON weekly_menu_items (menu_item_id);

-- Replaces snackOptionsByDate / mainMealOptionsByDate / breakfastOptionsByDate /
-- matterCoreMealOptionsByDate. `position` preserves the kitchen's entry order
-- (Matter Core assignment is positional; main meals cycle in order).
CREATE TABLE menu_day_options (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  weekly_menu_id bigint NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  option_date    date NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('snack_first','snack_second','main','sub','breakfast','matter_core')),
  position       smallint NOT NULL,
  name           text NOT NULL,
  protein_type   text CHECK (protein_type IN ('chicken','beef','fish')),
  c              numeric(6,1),
  p              numeric(6,1),
  f              numeric(6,1),
  exclusions     text[] NOT NULL DEFAULT '{}',
  UNIQUE (weekly_menu_id, option_date, kind, position),
  CHECK (kind NOT IN ('main','sub') OR protein_type IS NOT NULL)
);

-- Per-menu breakfast preset table (was breakfastPresetsByName Map).
CREATE TABLE menu_breakfast_presets (
  weekly_menu_id bigint NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  name_key       text NOT NULL,            -- normalised lookup key
  breakfast_name text NOT NULL DEFAULT '',
  c              numeric(6,1) NOT NULL DEFAULT 0,
  p              numeric(6,1) NOT NULL DEFAULT 0,
  f              numeric(6,1) NOT NULL DEFAULT 0,
  v              numeric(6,1) NOT NULL DEFAULT 80,
  is_large       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (weekly_menu_id, name_key)
);

-- Global kitchen presets (was singleton docs with key='global').
CREATE TABLE kitchen_breakfast_presets (
  name_key       text PRIMARY KEY,
  breakfast_name text NOT NULL DEFAULT '',
  c              numeric(6,1) NOT NULL DEFAULT 0,
  p              numeric(6,1) NOT NULL DEFAULT 0,
  f              numeric(6,1) NOT NULL DEFAULT 0,
  v              numeric(6,1) NOT NULL DEFAULT 80,
  is_large       boolean NOT NULL DEFAULT false
);
CREATE TABLE kitchen_snack_presets (
  name_key   text PRIMARY KEY,
  snack_name text NOT NULL DEFAULT '',
  c          numeric(6,1) NOT NULL DEFAULT 0,
  p          numeric(6,1) NOT NULL DEFAULT 0,
  f          numeric(6,1) NOT NULL DEFAULT 0
);

-- ------------------------------------------------------ menu selections
CREATE TABLE menu_selections (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mongo_id               text UNIQUE,
  weekly_menu_id         bigint NOT NULL REFERENCES weekly_menus(id) ON DELETE CASCADE,
  customer_id            bigint NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  email                  citext NOT NULL,          -- snapshot at submission
  customer_code          text,                     -- snapshot
  first_name             text,
  last_name              text,
  meal_exclusion         text,                     -- snapshot
  matter_subscription_id text,                     -- subscription submitted against
  submitted_at           timestamptz NOT NULL DEFAULT now(),
  -- cached macro results (source: macros.total / presets)
  total_c                numeric(7,1),
  total_p                numeric(7,1),
  total_f                numeric(7,1),
  total_calories         numeric(8,1),
  preset_breakfast_c     numeric(6,1),
  preset_breakfast_p     numeric(6,1),
  preset_breakfast_f     numeric(6,1),
  preset_snack_c         numeric(6,1),
  preset_snack_p         numeric(6,1),
  preset_snack_f         numeric(6,1),
  per_meal_macros        jsonb,                    -- derived cache (macros.perMeal)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weekly_menu_id, customer_id)             -- replaces the Mongo partial index
);
CREATE INDEX menu_selections_customer_idx ON menu_selections (customer_id);
CREATE INDEX menu_selections_email_idx    ON menu_selections (email);

CREATE TABLE menu_selection_meals (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  selection_id        bigint NOT NULL REFERENCES menu_selections(id) ON DELETE CASCADE,
  meal_date           date,
  meal_type           text CHECK (meal_type IN ('breakfast','main','snack')),
  menu_item_id        bigint REFERENCES menu_items(id) ON DELETE SET NULL,
  meal_name           text,
  description         text,
  slot_number         smallint,
  protein_choice      text,
  veg_choice          text,
  carb_choice         text,
  sauce_choice        text,
  manual_protein_type text NOT NULL DEFAULT '' CHECK (manual_protein_type IN ('','chicken','beef','fish')),
  quantity            smallint NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  carb_veg_action     text CHECK (carb_veg_action IN ('kept','replace')),
  carb_veg_conflict   text[] NOT NULL DEFAULT '{}',
  carb_conflict       text[] NOT NULL DEFAULT '{}',
  veg_conflict        text[] NOT NULL DEFAULT '{}',
  sauce_conflict      text[] NOT NULL DEFAULT '{}',
  garnish_conflict    text[] NOT NULL DEFAULT '{}',
  snack_c             numeric(6,1),
  snack_p             numeric(6,1),
  snack_f             numeric(6,1),
  is_auto_assigned    boolean NOT NULL DEFAULT false,
  needs_sauce_change  boolean NOT NULL DEFAULT false,
  needs_garnish_change boolean NOT NULL DEFAULT false
);
CREATE INDEX menu_selection_meals_selection_idx ON menu_selection_meals (selection_id, meal_date);
CREATE INDEX menu_selection_meals_item_idx      ON menu_selection_meals (menu_item_id) WHERE menu_item_id IS NOT NULL;

CREATE TABLE menu_selection_day_notes (
  selection_id bigint NOT NULL REFERENCES menu_selections(id) ON DELETE CASCADE,
  note_date    date NOT NULL,
  note         text NOT NULL CHECK (note <> ''),
  PRIMARY KEY (selection_id, note_date)
);

CREATE TABLE menu_selection_skipped_days (
  selection_id           bigint NOT NULL REFERENCES menu_selections(id) ON DELETE CASCADE,
  skipped_date           date NOT NULL,
  pause_status           text NOT NULL DEFAULT 'pending' CHECK (pause_status IN ('pending','success','already_paused','failed')),
  resume_date            date,
  matter_subscription_id text,
  error                  text,
  processed_at           timestamptz,
  PRIMARY KEY (selection_id, skipped_date)
);

-- ------------------------------------------------------ updated_at hooks
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','partners','bags','handoffs','customers','deliveries',
    'delivery_changes','menu_items','weekly_menus','menu_selections']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                   t || '_set_updated_at', t);
  END LOOP;
END $$;
