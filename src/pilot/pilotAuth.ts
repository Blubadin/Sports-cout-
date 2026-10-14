import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';

export type PilotAccess = { allowed: boolean; user_id?: string; expires_at?: string; exports_enabled: false };
const DEVICE_KEY = 'sportscout-pilot:device-credential:v1';

export function usernameToEmail(username: string): string {
  const alias = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(alias)) throw new Error('กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
  return `${alias}@pilot.sportscout.invalid`;
}

export function createPilotClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) return null;
  return createClient(url, key, { auth: { storageKey: 'sportscout-pilot-auth-v1', persistSession: true, detectSessionInUrl: false } });
}

export async function getDeviceCredential(): Promise<string> {
  const saved = await get<string>(DEVICE_KEY);
  if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  await set(DEVICE_KEY, token);
  return token;
}

export async function deviceApprovalCode(credential: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(credential));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function authorizePilot(client: SupabaseClient, credential: string): Promise<PilotAccess> {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new Error('กรุณาเข้าสู่ระบบอีกครั้ง');
  const { data, error } = await client.rpc('pilot_authorize_device', { device_credential: credential });
  if (error) throw new Error('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
  if (!data || data.allowed !== true || data.user_id !== identity.user.id || data.exports_enabled !== false ||
      !data.expires_at || Date.parse(data.expires_at) <= Date.now()) {
    throw new Error('บัญชีหรือเครื่องนี้ยังไม่ได้รับอนุมัติ สิทธิ์หมดอายุ หรือถูกเพิกถอน');
  }
  return data as PilotAccess;
}
