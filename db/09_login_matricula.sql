-- 09: Login por matrícula (usuario = matrícula, contraseña inicial = matrícula).
-- Cada jugador con matrícula tiene un usuario en auth.users con un email interno
-- <matricula>@jugador.bogeyinvitational.com.ar (nunca recibe mails). Al primer
-- login la app obliga a cambiar la contraseña (user_metadata.must_change_password).
-- Google sigue funcionando como opción secundaria (se vincula por players.email).

alter table public.players add column if not exists matricula text unique;

create or replace function public.matricula_email(m text)
returns text language sql immutable set search_path = '' as $$
  select m || '@jugador.bogeyinvitational.com.ar'
$$;

-- Jugador del usuario logueado: por auth_user_id (Google) o por el email interno (matrícula).
create or replace function public.current_player_id()
returns text language sql stable security definer set search_path = '' as $$
  select p.id from public.players p
  where p.auth_user_id = auth.uid()
     or (p.matricula is not null and lower(auth.jwt() ->> 'email') = public.matricula_email(p.matricula))
  order by (p.auth_user_id = auth.uid()) desc nulls last
  limit 1
$$;

-- Crea/actualiza el usuario de auth para la matrícula del jugador. Uso interno (sin chequeo de admin).
create or replace function public._upsert_matricula_login(p_player_id text, p_matricula text, p_reset boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
  v_email text;
  v_uid uuid;
begin
  p_matricula := trim(p_matricula);
  if p_matricula !~ '^[0-9]{3,8}$' then
    raise exception 'Matrícula inválida: %', p_matricula;
  end if;

  select matricula into v_old from public.players where id = p_player_id;
  if not found then raise exception 'Jugador inexistente: %', p_player_id; end if;
  update public.players set matricula = p_matricula where id = p_player_id;

  v_email := public.matricula_email(p_matricula);
  select id into v_uid from auth.users where email = v_email;

  -- Cambió la matrícula: se renombra el usuario existente en vez de crear otro.
  if v_uid is null and v_old is not null and v_old <> p_matricula then
    select id into v_uid from auth.users where email = public.matricula_email(v_old);
    if v_uid is not null then
      update auth.users set email = v_email, updated_at = now() where id = v_uid;
      update auth.identities
         set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
       where user_id = v_uid and provider = 'email';
      p_reset := true; -- la contraseña inicial es la matrícula nueva
    end if;
  end if;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_matricula, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('must_change_password', true, 'player_id', p_player_id),
      now(), now(), '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', null, now(), now()
    );
  elsif p_reset then
    update auth.users
       set encrypted_password = extensions.crypt(p_matricula, extensions.gen_salt('bf')),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
           updated_at = now()
     where id = v_uid;
  end if;
end $$;

revoke all on function public._upsert_matricula_login(text, text, boolean) from public, anon, authenticated;

-- RPC para admins: asignar matrícula (crea el login) o resetear la contraseña a la matrícula.
create or replace function public.admin_set_player_login(p_player_id text, p_matricula text, p_reset boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.players where id = public.current_player_id() and is_admin) then
    raise exception 'Solo los admins pueden gestionar logins';
  end if;
  perform public._upsert_matricula_login(p_player_id, p_matricula, p_reset);
end $$;

revoke all on function public.admin_set_player_login(text, text, boolean) from public, anon;
grant execute on function public.admin_set_player_login(text, text, boolean) to authenticated;
revoke all on function public.current_player_id() from public, anon;
grant execute on function public.current_player_id() to authenticated;
