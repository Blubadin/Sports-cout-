# Local AI service connection and security

Run `python ai_service/server.py` from the repository root. The service binds
`127.0.0.1:8000` by default. Loopback development (`localhost`, `127.0.0.1`,
`::1`) does not require a token unless `SPORTSCOUT_AI_AUTH_TOKEN` is set.

For an intentional non-loopback bind, set **all three** variables before
starting the process:

- `SPORTSCOUT_AI_HOST` to the intended interface
- `SPORTSCOUT_AI_REMOTE_ENABLED=true`
- `SPORTSCOUT_AI_AUTH_TOKEN` to a strong, private credential

Missing remote opt-in or token causes startup to fail. When a token is set,
all sensitive `/api` operations, including capabilities, require
`Authorization: Bearer <token>`. `GET /api/status` is a limited public health
endpoint. Browser WebSockets authenticate via `sportscout` and `auth.<token>`
subprotocols; native clients may use a Bearer header. The server only accepts
the `sportscout` application subprotocol and never accepts URL query tokens.
The frontend keeps credentials in memory for the current session, not project
data.

Legacy `/api/start` and `/api/start-stream` webcam/local-file sources are
disabled by default. To use a local direct source deliberately, set
`SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES=true`. Network URLs and UNC sources remain
unsupported. Uploaded TrackingSession videos do **not** need this switch.

An HTTPS-deployed frontend needs an explicitly configured secure AI endpoint
and a restricted `connect-src` that permits that endpoint. Do not point an
HTTPS page at an arbitrary HTTP LAN endpoint or assume the page host has an AI
service on port 8000. The default loopback sidecar is for local development;
remote exposure additionally requires transport protection at the deployment
boundary. Do not publish a bearer token in checked-in configuration, logs,
URLs, or exported projects.
