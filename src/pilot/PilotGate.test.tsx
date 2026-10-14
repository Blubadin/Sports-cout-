import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PilotAuthGate } from './PilotGate';
import { usernameToEmail } from './pilotAuth';

vi.mock('./pilotAuth', async importOriginal => ({
  ...await importOriginal<typeof import('./pilotAuth')>(),
  getDeviceCredential: vi.fn(async () => 'a'.repeat(64)),
  deviceApprovalCode: vi.fn(async () => 'device-fingerprint'),
}));

const userId = '11111111-1111-4111-8111-111111111111';
const getSession = vi.fn();
const getUser = vi.fn();
const signInWithPassword = vi.fn();
const rpc = vi.fn();
const client = {
  auth: { getSession, getUser, signInWithPassword, onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) }, rpc,
} as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: userId } } }, error: null });
  getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  rpc.mockResolvedValue({ data: { allowed: true, user_id: userId, expires_at: new Date(Date.now() + 300_000).toISOString(), exports_enabled: false }, error: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('pilot login boundary', () => {
  it('does not mount the workspace while configuration is missing', () => {
    render(<PilotAuthGate authClient={null}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    expect(screen.queryByText('PRIVATE WORKSPACE')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('ยังไม่ได้ตั้งค่า');
  });
  it('verifies the user and approved device before mounting the workspace', async () => {
    render(<PilotAuthGate authClient={client}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    await screen.findByText('PRIVATE WORKSPACE');
    expect(getUser).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('pilot_authorize_device', { device_credential: 'a'.repeat(64) });
  });
  it('rejects an unapproved device and displays only its approval fingerprint', async () => {
    rpc.mockResolvedValue({ data: { allowed: false }, error: null });
    render(<PilotAuthGate authClient={client}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    await screen.findByRole('alert');
    expect(screen.queryByText('PRIVATE WORKSPACE')).not.toBeInTheDocument();
    expect(screen.getByText('device-fingerprint')).toBeInTheDocument();
    expect(screen.queryByText('a'.repeat(64))).not.toBeInTheDocument();
  });
  it('does not trust a cached session when the Auth server rejects it', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'revoked' } });
    render(<PilotAuthGate authClient={client}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    await screen.findByRole('alert');
    expect(screen.queryByText('PRIVATE WORKSPACE')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('locks the workspace at lease expiry even if the network stops responding', async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: { allowed: true, user_id: userId, expires_at: new Date(Date.now() + 1000).toISOString(), exports_enabled: false }, error: null });
    render(<PilotAuthGate authClient={client}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('PRIVATE WORKSPACE')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(screen.queryByText('PRIVATE WORKSPACE')).not.toBeInTheDocument();
  });
  it('logs in with a username without embedding a password or requiring an email', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    signInWithPassword.mockResolvedValue({ error: { message: 'bad credentials' } });
    render(<PilotAuthGate authClient={client}><p>PRIVATE WORKSPACE</p></PilotAuthGate>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'Association1' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'only-in-test' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    await screen.findByRole('alert');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: usernameToEmail('association1'), password: 'only-in-test' });
    expect(screen.getByLabelText('รหัสผ่าน')).toHaveValue('');
  });
});
