/** Production builds are restricted even when their environment is incomplete. */
export const PILOT_RELEASE = import.meta.env.PROD || import.meta.env.VITE_SPORTSCOUT_RELEASE_CHANNEL === 'pilot';
export const EXPORT_DISABLED_MESSAGE = 'รุ่นทดลองนี้ปิดการส่งออกข้อมูล กรุณาดูผลภายในระบบ';

export function exportsAllowed(): boolean {
  return !PILOT_RELEASE;
}

export function requireExportPermission(): void {
  if (!exportsAllowed()) throw new Error('EXPORT_DISABLED_IN_PILOT');
}

let storageUser: string | null = null;

export function setPilotStorageUser(userId: string): void {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(userId)) throw new Error('Invalid storage identity');
  storageUser = userId;
}

/** Never fall back to development keys when the pilot is locked. */
export function scopedStorageKey(key: string): string {
  return PILOT_RELEASE ? `sportscout-pilot:${storageUser ?? 'locked'}:${key}` : key;
}
