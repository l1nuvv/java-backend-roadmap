-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.roadmap_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint roadmap_payload_object check (jsonb_typeof(payload) = 'object')
);
alter table public.roadmap_progress enable row level security;
revoke all on public.roadmap_progress from anon, authenticated;
grant select on public.roadmap_progress to authenticated;
drop policy if exists "Read own roadmap" on public.roadmap_progress;
create policy "Read own roadmap" on public.roadmap_progress
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes go through this function so stale clients cannot overwrite a newer revision.
create or replace function public.save_roadmap_progress(expected_revision bigint, new_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_row public.roadmap_progress; written boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object'
     or octet_length(new_payload::text) > 2000000 then raise exception 'Invalid payload'; end if;
  -- Transaction lock also serializes two simultaneous first inserts.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into current_row from public.roadmap_progress where user_id = uid for update;
  if not found then
    if expected_revision = 0 then
      insert into public.roadmap_progress(user_id, payload) values(uid, new_payload) returning * into current_row;
      written := true;
    end if;
  elsif current_row.revision = expected_revision then
    update public.roadmap_progress set payload = new_payload, revision = revision + 1, updated_at = now()
      where user_id = uid returning * into current_row;
    written := true;
  end if;
  return jsonb_build_object('saved', written, 'row', case when current_row.user_id is null then null else to_jsonb(current_row) end);
end;
$$;
revoke all on function public.save_roadmap_progress(bigint,jsonb) from public, anon;
grant execute on function public.save_roadmap_progress(bigint,jsonb) to authenticated;
