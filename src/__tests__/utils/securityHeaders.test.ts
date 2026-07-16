import { describe, expect, it } from 'vitest';
import vercelConfig from '../../../vercel.json';

describe('Vercel security headers', () => {
  it('applies core browser security headers to every route', () => {
    const route = vercelConfig.headers?.find((entry) => entry.source === '/(.*)');
    const headers = Object.fromEntries(route?.headers.map((header) => [header.key, header.value]) ?? []);

    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain('https://www.youtube.com');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });
});
