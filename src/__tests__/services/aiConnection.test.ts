import { describe, expect, it } from 'vitest';
import { AIConnectionError, resolveAiConnection, toWebSocketUrl } from '../../services/aiConnection';

describe('AI connection contract', () => {
  it('uses the loopback sidecar for localhost development', () => {
    expect(resolveAiConnection({ pageUrl: 'http://localhost:3000' })).toMatchObject({
      endpoint: 'http://127.0.0.1:8000',
      code: 'CONNECTED',
    });
    expect(resolveAiConnection({ pageUrl: 'http://127.0.0.1:3000' })).toMatchObject({
      endpoint: 'http://127.0.0.1:8000',
      code: 'CONNECTED',
    });
  });

  it('prefers an explicit configured endpoint', () => {
    expect(
      resolveAiConnection({
        pageUrl: 'https://app.example.com',
        configuredEndpoint: 'https://ai.example.com/',
      })
    ).toMatchObject({ endpoint: 'https://ai.example.com', code: 'CONNECTED' });
  });

  it('does not infer a port-8000 endpoint for arbitrary deployed hostnames', () => {
    expect(resolveAiConnection({ pageUrl: 'https://scout.example.com' })).toMatchObject({
      endpoint: null,
      code: 'ENDPOINT_NOT_CONFIGURED',
    });
  });

  it('rejects an insecure remote endpoint before browser mixed-content blocking', () => {
    expect(
      resolveAiConnection({
        pageUrl: 'https://scout.example.com',
        configuredEndpoint: 'http://ai.example.com:8000',
      })
    ).toMatchObject({ endpoint: 'http://ai.example.com:8000', code: 'MIXED_CONTENT' });
  });

  it('derives a WebSocket URL without a query-string credential', () => {
    expect(toWebSocketUrl('https://ai.example.com')).toBe('wss://ai.example.com/ws/telemetry');
  });

  it('keeps diagnostic errors free of credential values', () => {
    const error = new AIConnectionError('AUTH_FAILED', 'secret-value');
    expect(error.message).not.toContain('secret-value');
  });
});
