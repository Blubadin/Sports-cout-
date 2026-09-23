# SEC-0.1 Local AI Service Security Design

## Scope

SEC-0.1 hardens the SportsScout FastAPI AI sidecar for use on university, gym, and shared LAN networks. It does not introduce user accounts, cloud authentication, IndexedDB encryption, or SEC-1 work. Existing real player and shuttle pipelines remain unchanged except for the authentication boundary around their HTTP entry points.

Before implementation, the completed player/shuttle branch will be merged into `refactor/scouting-core-tracking-lab` so the security regression suite exercises the current production pipelines. The security implementation itself will be committed as `fix(security): lock down local ai service`.

## Runtime Configuration

The service will read these environment variables without providing any source-code secret:

- `SPORTSCOUT_AI_HOST`: bind host; defaults to `127.0.0.1`.
- `SPORTSCOUT_AI_REMOTE_ENABLED`: explicit remote-exposure opt-in; defaults to false.
- `SPORTSCOUT_AI_AUTH_TOKEN`: bearer secret. It is optional for loopback-only development and mandatory for non-loopback binding.
- `SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES`: enables legacy webcam and local-file control; defaults to false.

Host classification will recognize IPv4 and IPv6 loopback addresses plus `localhost`. Wildcard addresses, LAN addresses, and other hostnames are non-loopback.

Startup validation will reject a non-loopback host unless remote exposure is explicitly enabled. It will also reject non-loopback binding when the authentication token is absent. Error messages will identify the missing configuration but will never include the token value.

The supported launcher and `server.py` entry point will pass the validated host to Uvicorn. The default bind will therefore change from `0.0.0.0` to `127.0.0.1`. As defense in depth, requests received on a parseable non-loopback server address will also be denied unless the loaded configuration permits remote mode; this limits accidental exposure even if somebody invokes Uvicorn with an overriding CLI bind.

## Authentication Boundary

Authentication becomes active whenever remote mode is active or an authentication token is configured explicitly. This preserves token-free, loopback-only local development while allowing developers to test authentication locally by setting a token.

The following read-only discovery endpoints remain public:

- `GET /api/status`
- `GET /api/capabilities`

All remaining SportsScout `/api` endpoints are sensitive and require an exact bearer token when authentication is active. This includes legacy tracking controls, calibration and player mutation, every tracking-session lifecycle endpoint, uploaded video, session status/results, and session deletion.

REST clients send `Authorization: Bearer <token>`. Comparison uses a constant-time operation. Missing or invalid credentials return HTTP 401 with a generic response and a `WWW-Authenticate: Bearer` header. CORS remains a browser-origin control only and is not used as an authentication decision.

## WebSocket Authentication

`/ws/telemetry` validates credentials before calling `accept()`. Native clients may send the bearer authorization header. Browser clients may offer the protocols `sportscout` and `auth.<token>` through `Sec-WebSocket-Protocol`; the service validates the authentication protocol and accepts `sportscout` only after authorization succeeds.

The token will not be accepted in the query string because Uvicorn access logs can include request URLs. Rejected handshakes close with code 4401 and are never added to the connected-client set. Logs may state that authorization failed but must not print headers, protocol values, or secrets.

In loopback development with no configured token, the existing WebSocket connection flow remains valid without credentials.

## Legacy Source Policy

`POST /api/start` and `POST /api/start-stream` retain the synthetic `demo` source. Direct webcam indices and caller-supplied local file paths are rejected by default before `cv2.VideoCapture` is called.

When `SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES` is explicitly enabled, the legacy endpoints may open numeric webcam indices or existing local regular files. URI-based network streams and UNC paths remain rejected even when the legacy flag is enabled. This prevents an authenticated LAN caller from converting the sidecar into a general network-stream opener.

Tracking-session uploads remain supported. The upload endpoint writes to a service-owned temporary file, validates that the container opens and its first frame decodes, and then uses that owned path internally. The legacy direct-source flag does not affect this uploaded-video flow.

## Code Boundaries

A focused security configuration module will own environment parsing, loopback classification, startup validation, bearer extraction, constant-time token comparison, and direct-source classification. `server.py` will consume that module through small FastAPI dependencies and the pre-accept WebSocket check. Tracking, pose, player identity, shuttle inference, and telemetry implementations will not contain authentication logic.

The configuration API will be deterministic and independently testable without starting a listening socket. Tests will be able to replace the active settings for a request without mutating process-global environment state permanently.

## Error Handling

- Invalid remote configuration: fail startup with a configuration error naming the missing flag or token.
- Missing or invalid REST credentials: HTTP 401 with no secret detail.
- Missing or invalid WebSocket credentials: reject before acceptance with close code 4401.
- Disabled webcam or local path: HTTP 403 before worker/thread creation.
- Network URL or UNC path: HTTP 400 as an unsupported source type.
- Existing uploaded-session validation and lifecycle errors remain unchanged.

## Deterministic Test Coverage

Python security tests will prove:

- an unauthenticated sensitive request is rejected while authentication is active;
- the same request succeeds with the correct bearer token;
- a WebSocket without authorization is rejected before connection acceptance;
- the default bind host is `127.0.0.1`;
- a non-loopback host without the remote-enable flag fails validation;
- a non-loopback host without a token fails validation;
- legacy webcam access is disabled by default;
- legacy arbitrary local-file access is disabled by default;
- uploaded tracking-session video can still be created, uploaded, calibrated, assigned, analyzed, queried, and deleted;
- existing player and shuttle pipeline tests continue to pass.

The phase gate will run TypeScript checking, ESLint if the repository exposes an ESLint command/configuration, Vitest, and all Python unittests. Any regression will be fixed before the security commit.

## Security Properties and Limitations

The design prevents accidental LAN exposure, adds a shared-secret authorization boundary for intentional LAN mode, and removes default direct control of machine video sources. It does not provide per-user identity, token rotation, TLS, rate limiting, persistent audit logs, or encrypted browser storage. Those items remain outside SEC-0.1 and must not be represented as completed.
