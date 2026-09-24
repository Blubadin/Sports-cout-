# SEC-0.3 Frontend AI Connection Security Design

## Scope

SEC-0.3 hardens only the browser-side connection between SportsScout and the
FastAPI/local AI service. It does not alter the SEC-0.1/SEC-0.2 backend
authentication, tracking, upload, persistence, or scientific contracts.

The implementation will run on
`refactor/scouting-core-tracking-lab` and finish with the requested commit:
`fix(security): harden frontend ai connection`.

## Connection contract

`trackingSessionApi.ts` will resolve the AI origin using this priority:

1. A non-empty `VITE_SPORTSCOUT_AI_ENDPOINT` build-time endpoint.
2. A loopback development endpoint on `localhost` or `127.0.0.1` using the
   existing local-service port.
3. No endpoint for arbitrary deployed hostnames.

The current page hostname will never be converted into an AI endpoint unless it
is a loopback hostname. The resolver will normalize trailing slashes and expose
the origin used for diagnostics without exposing credentials.

## Browser safety and typed errors

A pure connection-contract module will classify configuration before network
activity. An HTTPS page with an HTTP non-loopback endpoint returns
`MIXED_CONTENT`/`MIXED_CONTENT_BLOCKED` and does not call `fetch` or construct a
WebSocket. Fetch failures are classified as `ENDPOINT_NOT_CONFIGURED`,
`AUTH_REQUIRED`, `AUTH_FAILED`, `BROWSER_SECURITY_BLOCKED`, `CSP_BLOCKED`,
`NETWORK_ERROR`, or `AI_OFFLINE` based on typed response/configuration data and
browser-safe error signals. User-facing messages use stable status values;
raw exception text remains diagnostics-only and is sanitized.

The client will retain compatibility with existing session methods while adding
a structured connection snapshot. HTTP 401 and 403 are handled distinctly from
transport failures. Health and capability probes remain usable for local
development, with sensitive lifecycle calls receiving authentication when the
runtime credential is present.

## Authentication and WebSocket behavior

The client accepts a runtime credential through an in-memory setter/configuration
boundary. The credential is never read from project state, localStorage,
IndexedDB, URL query parameters, logs, exports, or user-facing errors. Protected
REST calls send `Authorization: Bearer <token>`; discovery calls remain public
according to SEC-0.1.

Browser WebSocket authentication uses the backend-supported subprotocols
`sportscout` and `auth.<token>`. The token is not placed in a URL. The client
reports an unauthorized handshake as an authentication state, never as
connected, and stops reconnect attempts after permanent 401/403/4401-style
authorization failure. Transient transport failures use bounded reconnect
behavior.

## UI and CSP

Badminton Tracking Lab will render a compact English/Thai connection state for
connected, authentication required/failed, offline, endpoint not configured,
and browser/CSP/mixed-content blocking. Technical details remain available only
under existing diagnostics affordances and never contain the credential.

`vercel.json` will keep `connect-src` explicit and restricted to `'self'` and
the existing YouTube/Google origins because this repository currently defines
no approved remote AI production hostname. It will not use `connect-src *`.
Local HTTP sidecars are supported during local development. A deployed HTTPS
frontend supports same-origin/reverse-proxied AI or an explicitly approved
HTTPS AI origin added to the deployment CSP as a separate configuration change;
an arbitrary remote endpoint remains a typed CSP/browser-blocked state.

## Persistence and regression boundary

No AI endpoint credential is added to `ProjectTrackingState`, tracking IndexedDB
records, project exports, or localStorage. Existing player tracking, shuttle
tracking, upload, session status polling, and local development flows remain
unchanged apart from receiving structured connection/auth errors.

## Test coverage

Focused Vitest coverage will prove loopback resolution, explicit endpoint
precedence, no arbitrary-host `:8000` fallback, HTTPS/HTTP rejection, typed
401/403/offline/browser failures, bearer header attachment, redacted logs and
persistence boundaries, WebSocket unauthorized/authorized behavior and bounded
reconnects, UI state labels, and restricted CSP configuration. Existing frontend
tests, TypeScript, build, and the repository’s Python unittest suite will be
run before the phase commit.
