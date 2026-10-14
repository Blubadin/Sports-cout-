-- Isolated pilot authorization. No existing application tables are changed.
create schema if not exists sportscout_pilot;
revoke all on schema sportscout_pilot from public, anon, authenticated;
grant usage on schema sportscout_pilot to authenticated;

-- Public signup cannot set app_metadata. Only the Auth Admin provisioning tool
-- may create the two internal identities; user_metadata is never trusted.
create function sportscout_pilot.restrict_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email not in ('association1@pilot.sportscout.invalid', 'association2@pilot.sportscout.invalid')
    or coalesce(new.raw_app_meta_data->>'sportscout_pilot', '') <> 'true'
  then raise exception 'Public signup is disabled for SP Test'; end if;
  return new;
end;
$$;
revoke all on function sportscout_pilot.restrict_signup() from public, anon, authenticated;
create trigger sportscout_pilot_restrict_signup before insert on auth.users
for each row execute function sportscout_pilot.restrict_signup();

create table sportscout_pilot.members (
  slot smallint primary key check (slot between 1 and 2),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_-]{2,31}$'),
  active boolean not null default true,
  expires_at timestamptz not null default '2026-11-06 17:00:00+00',
  unique (slot, user_id)
);
create table sportscout_pilot.devices (
  slot smallint primary key,
  user_id uuid not null unique,
  credential_hash text not null unique check (credential_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz,
  approved_at timestamptz not null default now(),
  foreign key (slot, user_id) references sportscout_pilot.members(slot, user_id) on delete cascade
);
create table sportscout_pilot.sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_slot smallint not null references sportscout_pilot.devices(slot) on delete cascade,
  valid_until timestamptz not null
);
alter table sportscout_pilot.members enable row level security;
alter table sportscout_pilot.devices enable row level security;
alter table sportscout_pilot.sessions enable row level security;
revoke all on all tables in schema sportscout_pilot from public, anon, authenticated;

-- Narrow privileged broker: clients cannot read device hashes or modify approvals.
create function public.pilot_authorize_device(device_credential text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  current_session_id uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  approved_slot smallint;
  expiry timestamptz;
begin
  if current_user_id is null or current_session_id is null
    or device_credential is null or device_credential !~ '^[a-f0-9]{64}$'
    or not exists (select 1 from auth.sessions s where s.id = current_session_id and s.user_id = current_user_id)
  then return jsonb_build_object('allowed', false, 'exports_enabled', false); end if;

  select m.slot, least(m.expires_at, now() + interval '5 minutes') into approved_slot, expiry
  from sportscout_pilot.members m join sportscout_pilot.devices d on d.slot = m.slot and d.user_id = m.user_id
  where m.user_id = current_user_id and m.active and m.expires_at > now() and d.revoked_at is null
    and d.credential_hash = encode(sha256(convert_to(device_credential, 'UTF8')), 'hex');
  if approved_slot is null then
    return jsonb_build_object('allowed', false, 'exports_enabled', false);
  end if;

  insert into sportscout_pilot.sessions(session_id, user_id, device_slot, valid_until)
  values (current_session_id, current_user_id, approved_slot, expiry)
  on conflict (session_id) do update set valid_until = excluded.valid_until, device_slot = excluded.device_slot
  where sportscout_pilot.sessions.user_id = excluded.user_id;
  return jsonb_build_object('allowed', true, 'user_id', current_user_id, 'expires_at', expiry, 'exports_enabled', false);
end;
$$;

-- Reused by the project/storage RLS policies in the next phase; revocation is live.
create function sportscout_pilot.has_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from sportscout_pilot.sessions p
    join auth.sessions a on a.id = p.session_id and a.user_id = p.user_id
    join sportscout_pilot.members m on m.user_id = p.user_id
    join sportscout_pilot.devices d on d.slot = p.device_slot and d.user_id = p.user_id
    where p.user_id = auth.uid() and p.session_id = nullif(auth.jwt()->>'session_id', '')::uuid
      and p.valid_until > now() and m.active and m.expires_at > now() and d.revoked_at is null
  );
$$;
revoke all on function public.pilot_authorize_device(text) from public, anon, authenticated;
revoke all on function sportscout_pilot.has_access() from public, anon, authenticated;
grant execute on function public.pilot_authorize_device(text) to authenticated;
grant execute on function sportscout_pilot.has_access() to authenticated;
