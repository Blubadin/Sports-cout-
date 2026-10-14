create function sportscout_pilot.invalidate_device_sessions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.credential_hash is distinct from old.credential_hash
    or new.revoked_at is distinct from old.revoked_at
    or new.user_id is distinct from old.user_id then
    delete from sportscout_pilot.sessions where device_slot=old.slot;
  end if;
  return new;
end;
$$;
revoke all on function sportscout_pilot.invalidate_device_sessions() from public, anon, authenticated;
create trigger invalidate_pilot_device_sessions after update on sportscout_pilot.devices
for each row execute function sportscout_pilot.invalidate_device_sessions();
