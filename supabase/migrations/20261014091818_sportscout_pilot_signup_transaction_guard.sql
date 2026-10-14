-- GoTrue inserts the identity before applying app_metadata in the same transaction.
-- Check the final stored row at commit, not the initial INSERT snapshot.
create or replace function sportscout_pilot.restrict_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare identity_email text; approved_metadata jsonb;
begin
  select email, raw_app_meta_data into identity_email, approved_metadata from auth.users where id=new.id;
  if identity_email not in ('association1@pilot.sportscout.invalid', 'association2@pilot.sportscout.invalid')
    or coalesce(approved_metadata->>'sportscout_pilot', '') <> 'true'
  then raise exception 'Public signup is disabled for SP Test'; end if;
  return new;
end;
$$;
drop trigger sportscout_pilot_restrict_signup on auth.users;
create constraint trigger sportscout_pilot_restrict_signup after insert on auth.users
deferrable initially deferred for each row execute function sportscout_pilot.restrict_signup();
