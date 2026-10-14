// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';

const user1 = '11111111-1111-4111-8111-111111111111';
const user2 = '22222222-2222-4222-8222-222222222222';
const session1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id));
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(auth.jwt()->>'sub', '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
  `);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(name, directory), 'utf8'));
  }
}, 30_000);

beforeEach(async () => {
  await db.exec(`reset role; truncate auth.users cascade;
    insert into auth.users values
      ('${user1}', 'association1@pilot.sportscout.invalid', '{"sportscout_pilot":true}'),
      ('${user2}', 'association2@pilot.sportscout.invalid', '{"sportscout_pilot":true}');
    insert into auth.sessions values ('${session1}','${user1}'),('${session2}','${user2}');
    insert into sportscout_pilot.members(slot,user_id,username) values (1,'${user1}','association1'),(2,'${user2}','association2');
    insert into sportscout_pilot.devices(slot,user_id,credential_hash) values
      (1,'${user1}',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')),
      (2,'${user2}',encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex'));
  `);
});
afterAll(async () => { await db?.close(); });

async function login(user = user1, session = session1) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${user}","session_id":"${session}"}',false)`);
}
async function authorize(token: string) {
  const result = await db.query<{ access: { allowed: boolean; exports_enabled: boolean } }>('select public.pilot_authorize_device($1) as access', [token]);
  return result.rows[0].access;
}
async function allowed() {
  return (await db.query<{ allowed: boolean }>('select sportscout_pilot.has_access() as allowed')).rows[0].allowed;
}

describe('Postgres pilot authorization boundary', () => {
  it('requires a device proof before any protected data access', async () => {
    await login(); expect(await allowed()).toBe(false);
    expect(await authorize('a'.repeat(64))).toMatchObject({ allowed: true, exports_enabled: false });
    expect(await allowed()).toBe(true);
  });
  it('allows the second account only on its own approved device', async () => {
    await login(user2, session2);
    expect((await authorize('a'.repeat(64))).allowed).toBe(false);
    expect((await authorize('b'.repeat(64))).allowed).toBe(true);
  });
  it('rejects a third device and malformed credentials', async () => {
    await login();
    expect((await authorize('c'.repeat(64))).allowed).toBe(false);
    expect((await authorize('short')).allowed).toBe(false);
    expect(await allowed()).toBe(false);
  });
  it('denies access immediately after device revocation', async () => {
    await login(); await authorize('a'.repeat(64));
    await db.exec('reset role; update sportscout_pilot.devices set revoked_at=now() where slot=1');
    await login(); expect(await allowed()).toBe(false);
  });
  it('denies expired or revoked members even with a live lease', async () => {
    await login(); await authorize('a'.repeat(64));
    await db.exec("reset role; update sportscout_pilot.members set expires_at=now()-interval '1 second' where slot=1");
    await login(); expect(await allowed()).toBe(false);
  });
  it('does not revive an old device session after replacement or reapproval', async () => {
    await login(); await authorize('a'.repeat(64));
    await db.exec("reset role; update sportscout_pilot.devices set credential_hash=encode(sha256(convert_to(repeat('c',64),'UTF8')),'hex') where slot=1");
    await login(); expect(await allowed()).toBe(false);
    expect((await authorize('a'.repeat(64))).allowed).toBe(false);
    expect((await authorize('c'.repeat(64))).allowed).toBe(true);
  });
  it('cannot reuse a revoked Auth session', async () => {
    await login(); await authorize('a'.repeat(64));
    await db.exec(`reset role; delete from auth.sessions where id='${session1}'`);
    await login(); expect((await authorize('a'.repeat(64))).allowed).toBe(false);
    expect(await allowed()).toBe(false);
  });
  it('does not let authenticated clients read device hashes or approve themselves', async () => {
    await login();
    await expect(db.query('select * from sportscout_pilot.devices')).rejects.toThrow(/permission denied/i);
    await expect(db.exec('update sportscout_pilot.members set active=true')).rejects.toThrow(/permission denied/i);
  });
  it('does not expose the privileged RPC to anonymous requests', async () => {
    await db.exec('set role anon');
    await expect(authorize('a'.repeat(64))).rejects.toThrow(/permission denied/i);
  });
  it('rejects public signup, including an allowed name without admin metadata', async () => {
    await db.exec('truncate auth.users cascade');
    await expect(db.exec(`insert into auth.users(id,email) values ('${user1}','association1@pilot.sportscout.invalid')`)).rejects.toThrow(/signup is disabled/i);
    await expect(db.exec(`insert into auth.users values ('${user1}','other@example.test','{"sportscout_pilot":true}')`)).rejects.toThrow(/signup is disabled/i);
  });
  it('enforces two slots at the database boundary', async () => {
    await expect(db.exec(`insert into sportscout_pilot.members(slot,user_id,username) values (3,'${user1}','third')`)).rejects.toThrow();
  });
  it('allows Auth Admin to apply trusted metadata after INSERT in its transaction', async () => {
    await db.exec(`truncate auth.users cascade; begin;
      insert into auth.users(id,email) values ('${user1}','association1@pilot.sportscout.invalid');
      update auth.users set raw_app_meta_data='{"sportscout_pilot":true}' where id='${user1}'; commit;`);
    expect((await db.query('select id from auth.users')).rows).toHaveLength(1);
  });
});
