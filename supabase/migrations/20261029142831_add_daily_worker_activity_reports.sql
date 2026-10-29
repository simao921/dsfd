begin;

alter table public.progress_reports
  add column work_status text not null default 'in_progress'
  check (work_status in ('completed', 'in_progress', 'not_completed'));

create table public.daily_worker_reports (
  report_date date primary key,
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array'),
  generated_at timestamptz not null default now(),
  timezone text not null default 'Europe/Lisbon'
);

revoke all on table public.daily_worker_reports from anon, authenticated;
grant all privileges on table public.daily_worker_reports to service_role;
alter table public.daily_worker_reports enable row level security;

comment on column public.progress_reports.work_status is 'Worker self-reported completion state for the related project activity.';
comment on table public.daily_worker_reports is 'Daily snapshots for enabled workers, including explicit no-report statuses. Accessible only through the trusted server.';

commit;
