-- Local development seed (runs on `supabase db reset`). Demo tenant only.
-- Never seed production through this file.
--
-- Sign up through the app to create users and companies. To make yourself a
-- platform admin locally, run after signing up:
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
select 1;
