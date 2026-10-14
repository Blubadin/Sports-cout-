-- Keep elevated authorization logic out of the exposed API schema.
alter function public.pilot_authorize_device(text) set schema sportscout_pilot;
create function public.pilot_authorize_device(device_credential text)
returns jsonb language sql security invoker set search_path = '' as $$
  select sportscout_pilot.pilot_authorize_device(device_credential);
$$;
revoke all on function public.pilot_authorize_device(text) from public, anon, authenticated;
grant execute on function public.pilot_authorize_device(text) to authenticated;
revoke all on function sportscout_pilot.pilot_authorize_device(text) from public, anon, authenticated;
grant execute on function sportscout_pilot.pilot_authorize_device(text) to authenticated;

create policy administration_only on sportscout_pilot.members for all to anon, authenticated using (false) with check (false);
create policy administration_only on sportscout_pilot.devices for all to anon, authenticated using (false) with check (false);
create policy administration_only on sportscout_pilot.sessions for all to anon, authenticated using (false) with check (false);
