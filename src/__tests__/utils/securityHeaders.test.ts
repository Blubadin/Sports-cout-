import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vercelConfig from '../../../vercel.json';

describe('Vercel security headers', () => {
  it('applies core browser security headers to every route', () => {
    const route = vercelConfig.headers?.find((entry) => entry.source === '/(.*)');
    const headers = Object.fromEntries(route?.headers.map((header) => [header.key, header.value]) ?? []);

    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self'");
    expect(headers['Content-Security-Policy']).not.toContain('connect-src *');
    expect(headers['Content-Security-Policy']).toContain('https://www.youtube.com');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });

  it('documents only a public AI endpoint origin, never a Vite bearer token', () => {
    const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
    expect(envExample).toContain('VITE_SPORTSCOUT_AI_ENDPOINT');
    expect(envExample).not.toContain('VITE_SPORTSCOUT_AI_TOKEN');
  });
});
