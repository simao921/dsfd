begin;
select plan(21);

-- Stable fixture UUIDs; transaction rolls back, so no real client/worker accounts are created.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','portal-admin-test@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','client-a-test@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','client-b-test@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','worker-assigned-test@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000005','authenticated','authenticated','worker-other-test@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000006','authenticated','authenticated','worker-colleague-test@example.invalid','',now(),now(),now());
insert into public.profiles (id,role,username,full_name) values
 ('10000000-0000-4000-8000-000000000001','admin','test-admin','Test Admin'),
 ('10000000-0000-4000-8000-000000000002','client','client-a','Client A'),
 ('10000000-0000-4000-8000-000000000003','client','client-b','Client B'),
 ('10000000-0000-4000-8000-000000000004','worker','worker-a','Worker Assigned'),
 ('10000000-0000-4000-8000-000000000005','worker','worker-b','Worker Unassigned'),
 ('10000000-0000-4000-8000-000000000006','worker','worker-c','Worker Colleague');
insert into public.projects (id,name,published) values
 ('20000000-0000-4000-8000-000000000001','Client A Project',true),
 ('20000000-0000-4000-8000-000000000002','Client B Project',true);
insert into public.project_clients (project_id,client_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
insert into public.project_workers (project_id,worker_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006');
insert into public.project_updates (id,project_id,title,body,published,author_id) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Published','Visible update',true,'10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Draft','Hidden update',false,'10000000-0000-4000-8000-000000000001');
insert into public.internal_messages (id,project_id,sender_id,recipient_id,body) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',null,'Internal note'),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Private admin reply');
insert into public.progress_reports (id,project_id,worker_id,body) values
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','Progress detail');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.profiles),6,'admin can read managed profiles');
select is((select count(*)::int from public.projects),2,'admin can read all projects');
select is((select count(*)::int from public.internal_messages),2,'admin can read and manage both sides of internal conversations');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.projects),1,'client A reads only assigned published project');
select is((select count(*)::int from public.project_updates),1,'client reads published update only');
select is((select count(*)::int from public.internal_messages),0,'client cannot read internal messages');
select is((select count(*)::int from public.progress_reports),0,'client cannot read worker progress reports');
select is((select count(*)::int from public.projects where id='20000000-0000-4000-8000-000000000002'),0,'client A cannot read client B project');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.projects),1,'client B reads only its assigned project');
select is((select count(*)::int from public.internal_messages),0,'client B cannot read internal messages');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.projects),1,'assigned worker reads assigned project');
select is((select count(*)::int from public.internal_messages),2,'assigned worker reads own and admin-addressed messages');
select is((select count(*)::int from public.progress_reports),1,'assigned worker reads own progress reports');
select lives_ok(
 $$insert into public.internal_messages(project_id,sender_id,recipient_id,body) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',null,'Worker reply')$$,
 'assigned worker can send an internal reply to administration'
);
select is((select count(*)::int from public.internal_messages),3,'worker can see own new message and admin response');
select throws_ok(
 $$insert into public.project_updates(project_id,title,body,published,author_id) values ('20000000-0000-4000-8000-000000000001','Worker attempt','Must fail',true,'10000000-0000-4000-8000-000000000004')$$,
 '42501', null, 'worker cannot create or publish client-facing updates'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select is((select count(*)::int from public.internal_messages),0,'worker cannot read a colleague’s private conversation');
select is((select count(*)::int from public.progress_reports),0,'worker cannot read a colleague’s progress report');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.projects),0,'worker without assignment cannot read projects');
select is((select count(*)::int from public.internal_messages),0,'worker without assignment cannot read conversations');

reset role;
set local role anon;
select throws_ok(
 $$select count(*)::int from public.projects$$,
 '42501', null, 'anonymous visitors cannot read private project records'
);
reset role;
select * from finish();
rollback;
