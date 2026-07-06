-- Local dev seed. Runs automatically on `supabase db reset`.
-- Creates ONE confirmed test user so you can log in immediately.
--
--   email:    test@provenrealty.com
--   password: ProvenIQ123!
--
-- NOTE: For a hosted Supabase project, prefer creating users via the
-- Dashboard (Authentication > Users > Add user, with "Auto Confirm"),
-- then set their role to 'admin' in the profiles table. This SQL block
-- is intended for the local Supabase CLI stack.

do $$
declare
  uid           uuid := gen_random_uuid();
  test_email    text := 'test@provenrealty.com';
  test_password text := 'ProvenIQ123!';
begin
  -- Skip if this user already exists.
  if exists (select 1 from auth.users where email = test_email) then
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', uid,
    'authenticated', 'authenticated', test_email,
    crypt(test_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Test Admin')
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), uid,
    jsonb_build_object('sub', uid::text, 'email', test_email),
    'email', test_email, now(), now(), now()
  );

  -- The on_auth_user_created trigger already inserted a profile row;
  -- promote this test user to admin.
  update public.profiles
     set role = 'admin', full_name = 'Test Admin'
   where id = uid;
end $$;
