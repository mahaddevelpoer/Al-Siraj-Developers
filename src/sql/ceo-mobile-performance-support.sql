-- CEO mobile performance support for AL SIRAJ DEVELOPERS.
-- Run once in Supabase SQL Editor after the business tables exist.
-- Safe/idempotent: it only creates indexes/views/functions if missing/replaces views.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appeals' and column_name = 'status')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appeals' and column_name = 'created_at') then
    execute 'create index if not exists idx_appeals_status_created_at on public.appeals (status, created_at desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appeals' and column_name = 'town_name')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appeals' and column_name = 'status')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appeals' and column_name = 'created_at') then
    execute 'create index if not exists idx_appeals_town_status_created_at on public.appeals (town_name, status, created_at desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_entries' and column_name = 'review_status')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_entries' and column_name = 'created_at') then
    execute 'create index if not exists idx_daily_entries_review_created_at on public.daily_entries (review_status, created_at desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_entries' and column_name = 'date')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_entries' and column_name = 'town_name')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_entries' and column_name = 'type') then
    execute 'create index if not exists idx_daily_entries_date_town_type on public.daily_entries (date, town_name, type)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'dismissed')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'created_date') then
    execute 'create index if not exists idx_notifications_dismissed_created_date on public.notifications (dismissed, created_date desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_library' and column_name = 'type')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_library' and column_name = 'report_date')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_library' and column_name = 'created_at') then
    execute 'create index if not exists idx_media_daily_receipts on public.media_library (type, report_date, created_at desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'all_sales' and column_name = 'town_name')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'all_sales' and column_name = 'created_at') then
    execute 'create index if not exists idx_all_sales_town_created_at on public.all_sales (town_name, created_at desc)';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'role')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'town_name')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'online_status')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'last_seen_at') then
    execute 'create index if not exists idx_users_role_town_online on public.users (role, town_name, online_status, last_seen_at desc)';
  end if;
end $$;

create or replace view public.ceo_mobile_active_towns as
select *
from public.towns
where coalesce(deleted_at::text, '') = ''
  and lower(coalesce(status::text, 'active')) not in ('deleted', 'inactive', 'archived');

create or replace function public.ceo_mobile_review_inbox(
  p_status text default 'pending',
  p_limit integer default 40
)
returns table (
  id text,
  review_kind text,
  appeal_type text,
  status text,
  created_at timestamptz,
  town_name text,
  requested_data jsonb,
  requested_by_user_id jsonb,
  reason text,
  entry_id text,
  date text,
  type text,
  amount numeric,
  description text,
  category text,
  review_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id::text,
    'appeal'::text as review_kind,
    a.appeal_type::text,
    lower(coalesce(a.status::text, 'pending')) as status,
    a.created_at,
    a.town_name::text,
    case
      when jsonb_typeof(to_jsonb(a.requested_data)) = 'object' then to_jsonb(a.requested_data)
      else '{}'::jsonb
    end as requested_data,
    case
      when u.id is null then null::jsonb
      else jsonb_build_object(
        'id', u.id,
        'full_name', u.full_name,
        'email', u.email,
        'town_name', u.town_name,
        'town_id', u.town_id
      )
    end as requested_by_user_id,
    a.reason::text,
    null::text as entry_id,
    null::text as date,
    null::text as type,
    null::numeric as amount,
    null::text as description,
    null::text as category,
    null::text as review_status
  from public.appeals a
  left join public.users u on u.id = a.requested_by_user_id
  where lower(coalesce(a.status::text, 'pending')) = lower(coalesce(p_status, 'pending'))

  union all

  select
    d.id::text,
    'dailyEntry'::text as review_kind,
    'daily_entry_review'::text as appeal_type,
    lower(coalesce(d.review_status::text, 'approved')) as status,
    d.created_at,
    d.town_name::text,
    jsonb_build_object(
      'town_name', d.town_name,
      'type', d.type,
      'category', d.category,
      'amount', d.amount,
      'date', d.date,
      'description', d.description
    ) as requested_data,
    null::jsonb as requested_by_user_id,
    null::text as reason,
    d.entry_id::text,
    d.date::text,
    d.type::text,
    d.amount::numeric,
    d.description::text,
    d.category::text,
    d.review_status::text
  from public.daily_entries d
  where lower(coalesce(d.review_status::text, 'approved')) = lower(coalesce(p_status, 'pending'))
  order by created_at desc
  limit greatest(coalesce(p_limit, 40), 1);
$$;

create or replace function public.ceo_mobile_daily_receipt_rows(
  p_report_date date default current_date
)
returns table (
  id text,
  entry_id text,
  town_name text,
  date text,
  type text,
  amount numeric,
  description text,
  category text,
  review_status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id::text,
    d.entry_id::text,
    d.town_name::text,
    d.date::text,
    d.type::text,
    d.amount::numeric,
    d.description::text,
    d.category::text,
    lower(coalesce(d.review_status::text, 'approved')) as review_status,
    d.created_at
  from public.daily_entries d
  join public.ceo_mobile_active_towns t
    on t.town_name::text = d.town_name::text
  where d.date::date = p_report_date
    and lower(coalesce(d.review_status::text, 'approved')) not in ('pending', 'rejected')
  order by d.town_name, d.created_at;
$$;

notify pgrst, 'reload schema';
