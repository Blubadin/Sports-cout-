import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConnectionError } from '../../services/aiConnection';
import { TrackingSessionApiClient } from '../../services/trackingSessionApi';
import { createDefaultProjectTrackingState } from '../../services/trackingSessionStore';

class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public onopen: (() => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public readonly url: string;
  public readonly protocols: string[];

  public constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  public close(): void {}
}

describe('TrackingSessionApiClient connection security', () => {
  const originalFetch = global.fetch;
  const originalWebSocket = global.WebSocket;
  let client: TrackingSessionApiClient;

  beforeEach(() => {
    client = new TrackingSessionApiClient();
    client.setBaseUrl('http://127.0.0.1:8000');
    FakeWebSocket.instances = [];
    global.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('attaches a runtime-only bearer credential to protected REST calls', async () => {
    client.setCredential('secret-value');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 'session-1', status: 'READY' }),
    } as Response);

    await client.createSession('doubles');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/tracking/sessions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-value',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('maps a missing credential 401 to AUTH_REQUIRED without exposing the secret', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' } as Response);

    await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(client.createSession('doubles')).rejects.not.toThrow('secret-value');
  });

  it('maps invalid credentials and forbidden responses to AUTH_FAILED', async () => {
    client.setCredential('secret-value');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' } as Response);
    await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_FAILED' });

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' } as Response);
    await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('does not log a credential when an authenticated request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    client.setCredential('secret-value');
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' } as Response);

    await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_FAILED' });

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('secret-value');
  });

  it('keeps a runtime credential out of serializable tracking project state', () => {
    client.setCredential('secret-value');
    expect(JSON.stringify(createDefaultProjectTrackingState('project-1'))).not.toContain('secret-value');
  });

  it('reports an offline backend separately from HTTP authentication failures', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(client.checkConnection()).resolves.toMatchObject({ code: 'AI_OFFLINE', connected: false });
  });

  it('uses the backend-supported subprotocols for an authenticated WebSocket', () => {
    client.setCredential('secret-value');
    const socket = client.connectTelemetry();

    expect(socket).toBe(FakeWebSocket.instances[0]);
    expect(FakeWebSocket.instances[0]).toMatchObject({
      url: 'ws://127.0.0.1:8000/ws/telemetry',
      protocols: ['sportscout', 'auth.secret-value'],
    });

    FakeWebSocket.instances[0].onopen?.();
    expect(client.getConnectionSnapshot()).toMatchObject({ code: 'CONNECTED', connected: true });
  });

  it('treats a 4401 socket close as an auth failure and does not retry it', () => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(global, 'setTimeout');
    client.setCredential('secret-value');
    client.connectTelemetry();

    FakeWebSocket.instances[0].onclose?.({ code: 4401 } as CloseEvent);

    expect(client.getConnectionSnapshot()).toMatchObject({ code: 'AUTH_FAILED', connected: false });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('rejects unsafe endpoints without constructing a socket', () => {
    client.setBaseUrl('http://ai.example.com:8000');
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://scout.example.com'),
    });

    expect(() => client.connectTelemetry()).toThrow(AIConnectionError);
    expect(FakeWebSocket.instances).toHaveLength(0);

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });
});
