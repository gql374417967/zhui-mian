create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users default auth.uid(),
  project_text text not null,
  track text not null,
  jd_analysis jsonb,
  rounds jsonb default '[]',
  report jsonb,
  status text default 'in_progress',
  created_at timestamptz default now()
);

alter table public.interviews enable row level security;

drop policy if exists "own rows" on public.interviews;
create policy "own rows" on public.interviews for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.interviews from anon, authenticated;
grant select, insert, update, delete on public.interviews to authenticated;

create index if not exists interviews_user_id_id_idx on public.interviews (user_id, id);
