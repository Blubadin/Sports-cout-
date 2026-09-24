# SEC-0.3 Frontend AI Connection Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend AI service connection explicit, HTTPS-safe, authenticated in memory only, and capable of reporting actionable typed states.

**Architecture:** A small pure connection module resolves and validates the AI origin without network side effects. `TrackingSessionApiClient` consumes that contract to wrap REST and WebSocket operations with typed errors and runtime-only credentials. The Tracking Lab renders the typed connection snapshot while the current tracking lifecycle APIs retain their public methods.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vitest 4, Testing Library, FastAPI local sidecar.

## Global Constraints

- Implement frontend ↔ AI service security only; do not change backend authentication.
- Use `VITE_SPORTSCOUT_AI_ENDPOINT` only for a public endpoint origin; never use a Vite environment variable for a bearer token.
- Prioritize explicit endpoint, then loopback local development, then unavailable; never infer `:8000` from a non-loopback page hostname.
- An HTTPS page with an HTTP non-loopback endpoint must return a typed mixed-content error before a request or WebSocket is attempted.
- REST credentials stay runtime/session-scoped and use SEC-0.1 `Authorization: Bearer <token>` semantics.
- Browser WebSockets use SEC-0.1 `sportscout` and `auth.<token>` subprotocols; no query-string credential.
- Never log, persist, export, or display a credential.
- Keep `vercel.json` CSP restricted; no `connect-src *`.
- Keep player tracking, shuttle tracking, session upload, and session polling working.
- Do not begin SEC-1 or Phase 2.10.
- Finish code changes with `fix(security): harden frontend ai connection`.

---

### Task 1: Pure connection resolution and status contract

**Files:**
- Create: `src/services/aiConnection.ts`
- Create: `src/__tests__/services/aiConnection.test.ts`

**Interfaces:**
- Produces: `AIConnectionCode`, `AIConnectionSnapshot`, `AIConnectionError`, `resolveAiConnection(options)`, `toWebSocketUrl(origin)`.
- Consumed by: `src/services/trackingSessionApi.ts`, Tracking Lab UI tests.

- [ ] **Step 1: Write the failing resolver tests**

```ts
expect(resolveAiConnection({ pageUrl: 'http://localhost:3000' }).endpoint).toBe('http://127.0.0.1:8000');
expect(resolveAiConnection({ pageUrl: 'http://127.0.0.1:3000' }).endpoint).toBe('http://127.0.0.1:8000');
expect(resolveAiConnection({ pageUrl: 'https://app.example.com', configuredEndpoint: 'https://ai.example.com' }).endpoint).toBe('https://ai.example.com');
expect(resolveAiConnection({ pageUrl: 'https://app.example.com' }).code).toBe('ENDPOINT_NOT_CONFIGURED');
expect(resolveAiConnection({ pageUrl: 'https://app.example.com', configuredEndpoint: 'http://ai.example.com' }).code).toBe('MIXED_CONTENT');
```

- [ ] **Step 2: Run the resolver test to verify RED**

Run: `npm test -- src/__tests__/services/aiConnection.test.ts`

Expected: FAIL because `aiConnection.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver and typed error**

```ts
export type AIConnectionCode = 'CONNECTED' | 'AI_OFFLINE' | 'AUTH_REQUIRED' | 'AUTH_FAILED' | 'ENDPOINT_NOT_CONFIGURED' | 'MIXED_CONTENT' | 'NETWORK_ERROR' | 'BROWSER_SECURITY_BLOCKED' | 'CSP_BLOCKED';

export function resolveAiConnection(options: ResolveAiConnectionOptions): AIConnectionResolution {
  // Explicit normalized endpoint wins; only loopback pages receive a default.
  // HTTPS/non-loopback HTTP is rejected before creating a network URL.
}
```

- [ ] **Step 4: Run the resolver test to verify GREEN**

Run: `npm test -- src/__tests__/services/aiConnection.test.ts`

Expected: PASS.

### Task 2: Authenticated REST client and safe WebSocket connector

**Files:**
- Modify: `src/services/trackingSessionApi.ts`
- Create: `src/__tests__/services/trackingSessionApi.security.test.ts`

**Interfaces:**
- Consumes: `resolveAiConnection`, `AIConnectionError`, `toWebSocketUrl`.
- Produces: `setCredential(token: string | null)`, `checkConnection()`, `connectTelemetry()`, typed rejections for all sensitive API methods.

- [ ] **Step 1: Write failing client tests**

```ts
client.setCredential('secret-value');
await client.createSession('doubles');
expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
  headers: expect.objectContaining({ Authorization: 'Bearer secret-value' }),
}));

await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
await expect(client.createSession('doubles')).rejects.toMatchObject({ code: 'AUTH_FAILED' });
expect(new WebSocket(url, ['sportscout', 'auth.secret-value'])).toBeDefined();
```

- [ ] **Step 2: Run the client security test to verify RED**

Run: `npm test -- src/__tests__/services/trackingSessionApi.security.test.ts`

Expected: FAIL because credentials, typed request errors, and WebSocket connector are absent.

- [ ] **Step 3: Implement the minimal request wrapper and connector**

```ts
private async request(path: string, init: RequestInit = {}, sensitive = true): Promise<Response> {
  // Resolve once, reject preflight failures, attach bearer only to sensitive calls,
  // and map 401/403/transport errors to AIConnectionError without secret detail.
}

public connectTelemetry(): WebSocket | null {
  // Reject unsafe/missing endpoint; use supported subprotocols; stop retries after auth rejection.
}
```

- [ ] **Step 4: Run the client security test to verify GREEN**

Run: `npm test -- src/__tests__/services/trackingSessionApi.security.test.ts`

Expected: PASS, including authorized/unauthorized WebSocket state and bounded reconnect behavior.

### Task 3: Tracking Lab status and non-persistence tests

**Files:**
- Modify: `src/components/labs/BadmintonTrackingLab.tsx`
- Modify: `src/components/labs/BadmintonTrackingLab.test.tsx`
- Modify: `src/__tests__/badminton/AITracking.test.ts`

**Interfaces:**
- Consumes: `AIConnectionSnapshot` from `checkConnection()`.
- Produces: localized concise connection labels and diagnostics-safe UI state.

- [ ] **Step 1: Write failing UI and persistence tests**

```tsx
mockCheckConnection.mockResolvedValue({ code: 'AUTH_REQUIRED', connected: false });
render(<BadmintonTrackingLab />);
expect(await screen.findByRole('status')).toHaveTextContent('Authentication required');

trackingSessionApi.setCredential('secret-value');
expect(JSON.stringify(trackingSessionStore.getProjectState('project-1'))).not.toContain('secret-value');
```

- [ ] **Step 2: Run the affected UI tests to verify RED**

Run: `npm test -- src/components/labs/BadmintonTrackingLab.test.tsx src/__tests__/badminton/AITracking.test.ts`

Expected: FAIL because the UI has a boolean-only online state and no typed connection display.

- [ ] **Step 3: Render the typed state without technical secret data**

```tsx
const connection = await aiTrackingService.checkConnection();
setConnection(connection);
// Render a status label from connection.code, not an exception message.
```

- [ ] **Step 4: Run the affected UI tests to verify GREEN**

Run: `npm test -- src/components/labs/BadmintonTrackingLab.test.tsx src/__tests__/badminton/AITracking.test.ts`

Expected: PASS.

### Task 4: Deployment configuration and final regression coverage

**Files:**
- Modify: `.env.example`
- Modify: `src/__tests__/utils/securityHeaders.test.ts`
- Modify: `vercel.json` only if a strictly enumerated supported origin is required by an existing deployment contract.

**Interfaces:**
- Consumes: `VITE_SPORTSCOUT_AI_ENDPOINT` as a public endpoint origin.
- Produces: documented local/deployed connection contract and CSP regression assertion.

- [ ] **Step 1: Write a failing CSP/configuration test**

```ts
expect(csp).toContain("connect-src 'self'");
expect(csp).not.toMatch(/connect-src[^;]*\*/);
expect(envExample).toContain('VITE_SPORTSCOUT_AI_ENDPOINT');
expect(envExample).not.toContain('VITE_SPORTSCOUT_AI_TOKEN');
```

- [ ] **Step 2: Run the CSP test to verify RED**

Run: `npm test -- src/__tests__/utils/securityHeaders.test.ts`

Expected: FAIL because the endpoint contract is not documented and CSP restriction is not asserted.

- [ ] **Step 3: Document the endpoint contract and retain restrictive CSP**

```dotenv
# Public origin only; deployed HTTPS frontends require an HTTPS endpoint permitted by CSP.
VITE_SPORTSCOUT_AI_ENDPOINT=
```

- [ ] **Step 4: Run targeted tests, then the required phase gate**

Run:

```powershell
npm test -- src/__tests__/services/aiConnection.test.ts src/__tests__/services/trackingSessionApi.security.test.ts src/components/labs/BadmintonTrackingLab.test.tsx src/__tests__/badminton/AITracking.test.ts src/__tests__/utils/securityHeaders.test.ts
npm test
npm run lint
npm run build
python -m unittest discover -s ai_service/tests -p "test_*.py"
git diff --check
```

Expected: all commands exit 0 and no credential appears in the source diff or tracked persistence/export schemas.

- [ ] **Step 5: Commit SEC-0.3 only**

```powershell
git add -- .env.example vercel.json src/services/aiConnection.ts src/services/trackingSessionApi.ts src/components/labs/BadmintonTrackingLab.tsx src/__tests__/services/aiConnection.test.ts src/__tests__/services/trackingSessionApi.security.test.ts src/components/labs/BadmintonTrackingLab.test.tsx src/__tests__/badminton/AITracking.test.ts src/__tests__/utils/securityHeaders.test.ts docs/superpowers/plans/2026-09-24-sec-0-3-frontend-ai-connection-security.md
git commit -m "fix(security): harden frontend ai connection"
```
