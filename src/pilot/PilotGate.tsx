import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizePilot, createPilotClient, deviceApprovalCode, getDeviceCredential, usernameToEmail, type PilotAccess } from './pilotAuth';
import { PILOT_RELEASE, setPilotStorageUser } from './releasePolicy';
import { flushPilotWorkspace } from './pilotLifecycle';

// Workspace modules (including persisted tracking state) load only after authorization.
const Workstation = lazy(() => import('../App'));
const client = PILOT_RELEASE ? createPilotClient() : null;

export function PilotAuthGate({ authClient = client, children }: { authClient?: SupabaseClient | null; children: React.ReactNode }) {
  const [access, setAccess] = useState<PilotAccess | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [approvalCode, setApprovalCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const activeUser = useRef<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const checkAccess = useCallback(async () => {
    const request = ++generation.current;
    if (!authClient) { setBusy(false); return; }
    try {
      const { data, error } = await authClient.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        if (activeUser.current) { window.location.reload(); return; }
        if (mounted.current && request === generation.current) { setAccess(null); setBusy(false); }
        return;
      }
      if (activeUser.current && activeUser.current !== data.session.user.id) { window.location.reload(); return; }
      const credential = await getDeviceCredential();
      const code = await deviceApprovalCode(credential);
      if (mounted.current && request === generation.current) setApprovalCode(code);
      const allowed = await authorizePilot(authClient, credential);
      if (!mounted.current || request !== generation.current) return;
      activeUser.current = allowed.user_id!;
      setPilotStorageUser(allowed.user_id!);
      setAccess(allowed);
      setMessage('');
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      setAccess(null);
      setMessage(error instanceof Error ? error.message : 'ตรวจสอบสิทธิ์ไม่สำเร็จ');
    } finally {
      if (mounted.current && request === generation.current) setBusy(false);
    }
  }, [authClient]);

  useEffect(() => {
    mounted.current = true;
    void checkAccess();
    const timer = window.setInterval(() => { void checkAccess(); }, 60_000);
    // Scheduling avoids making Supabase requests inside its auth-event lock.
    const { data } = authClient?.auth.onAuthStateChange(() => { window.setTimeout(() => { if (mounted.current) void checkAccess(); }, 0); }) ?? { data: null };
    const onVisible = () => { if (document.visibilityState === 'visible') void checkAccess(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted.current = false; ++generation.current; clearInterval(timer); data?.subscription.unsubscribe(); document.removeEventListener('visibilitychange', onVisible); };
  }, [authClient, checkAccess]);

  useEffect(() => {
    if (!access?.expires_at) return;
    const timer = window.setTimeout(() => {
      ++generation.current;
      setAccess(null);
      setMessage('สิทธิ์หมดอายุ กรุณาตรวจสอบการเชื่อมต่อแล้วตรวจสอบสิทธิ์อีกครั้ง');
    }, Math.max(0, Date.parse(access.expires_at) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [access]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!authClient) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await authClient.auth.signInWithPassword({ email: usernameToEmail(username), password });
      setPassword('');
      if (error) throw new Error('กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน');
      await checkAccess();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try {
      await flushPilotWorkspace();
      const result = await authClient?.auth.signOut({ scope: 'local' });
      if (result?.error) throw new Error('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
      window.location.reload();
    } catch {
      setMessage('บันทึกหรือออกจากระบบไม่สำเร็จ กรุณาลองใหม่ก่อนปิดหน้าเว็บ');
    } finally { setBusy(false); }
  }

  if (access && Date.parse(access.expires_at!) > Date.now()) return <>
    <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-[#0b1219] px-4 py-2 text-xs text-slate-300">
      <span>SP Test · รุ่นทดลองเฉพาะผู้ได้รับอนุมัติ · ปิดการส่งออก</span>
      <button disabled={busy} className="rounded border border-slate-600 px-3 py-1 hover:bg-slate-800 disabled:opacity-50" onClick={() => void signOut()}>ออกจากระบบ</button>
    </div>
    {message && <p role="alert" className="bg-slate-900 px-4 py-2 text-sm text-amber-300">{message}</p>}
    {children}
  </>;

  return <main className="flex min-h-screen items-center justify-center bg-[#0b1219] p-6 text-slate-100">
    <section className="w-full max-w-md space-y-5 rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h1 className="text-xl font-semibold">SPORTSCOUT · SP Test</h1>
      <p className="text-sm text-slate-400">สำหรับผู้ทดสอบและเครื่องที่ได้รับอนุมัติเท่านั้น</p>
      {!authClient ? <p role="alert">ยังไม่ได้ตั้งค่าระบบบัญชี กรุณาติดต่อผู้ดูแล</p> : <form className="space-y-4" onSubmit={event => void signIn(event)}>
        <label className="block text-sm">ชื่อผู้ใช้<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" /></label>
        <label className="block text-sm">รหัสผ่าน<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" /></label>
        <button disabled={busy} className="w-full rounded bg-sky-600 px-4 py-2 font-medium disabled:opacity-50">{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
      </form>}
      {message && <p role="alert" className="text-sm text-amber-300">{message}</p>}
      {approvalCode && !access && <div className="space-y-2 text-xs text-slate-400"><p>รหัสระบุเครื่องสำหรับให้ผู้ดูแลอนุมัติ (ไม่ใช่รหัสผ่าน)</p><code className="block break-all select-all">{approvalCode}</code><button onClick={() => void checkAccess()} className="rounded border border-slate-600 p-2">ตรวจสอบสิทธิ์อีกครั้ง</button><button onClick={() => void signOut()} className="ml-2 rounded border border-slate-600 p-2">ออกจากระบบ</button></div>}
    </section>
  </main>;
}

export default function PilotGate() {
  const workstation = <Suspense fallback={<div role="status" className="min-h-screen bg-[#0b1219] p-8 text-slate-200">กำลังเตรียมพื้นที่ทำงาน…</div>}><Workstation /></Suspense>;
  return PILOT_RELEASE ? <PilotAuthGate>{workstation}</PilotAuthGate> : workstation;
}
