# SEC-0.2 — Upload and resource limits

## Configuration

Set `SPORTSCOUT_AI_MAX_UPLOAD_BYTES` in the Python service environment. Default:
`8589934592` bytes (8 GiB). Accepted configuration is a positive decimal integer
up to 1 TiB; malformed configuration fails uploads closed with HTTP 503.
The service does not load `.env` automatically.

```powershell
$env:SPORTSCOUT_AI_MAX_UPLOAD_BYTES = '8589934592'
python ai_service/server.py
```

The limit applies to bytes, not duration. A one-hour video is accepted if it fits
the configured byte budget and can be decoded. There is no full-body buffering.
Content-Length is checked before a tempfile is opened; streamed bytes are checked
before each write, including requests with no Content-Length or a false header.
The first chunk that would exceed the budget is not written; the partial file is
closed and removed, and the service returns HTTP 413.

## Ownership and media validation

Filename extension and Content-Type do not establish validity. OpenCV must open
the upload and decode its first frame. Actual bytes must first identify a supported
video container: AVI, MP4/M4V/MOV (documented video brands in `upload_media.py`), or
MKV/WebM. This conservative gate rejects still images, including images with a
video extension/MIME type. Unsupported containers/brands return 422. One-frame
videos remain valid. Existing metadata extraction then runs
before any session ownership changes. Failure returns a safe status and removes
the new tempfile, preserving an existing uploaded video and its metadata.

A successful replacement removes the previous owned tempfile. Session deletion
and analysis initialization/execution failure remove only `owned_video_path`;
caller-supplied source files are never unlinked. Decoder handles are released
before cleanup, including failures when reading headers. Upload disconnects and
task cancellation execute the same finally-based partial-file cleanup.

Upload, deletion, calibration, player assignment, and analysis start coordinate
through the session state lock. `_uploading` remains asserted through cleanup;
competing operations return HTTP 409. Deletion marks the session busy before
waiting for a worker, without holding the lock during thread join.

Unexpected storage errors use HTTP 507; media validation errors use HTTP 422.
Detailed exception paths stay in server logs. API validation errors omit raw
input/context, which also prevents NaN/Infinity from breaking error serialization.
Shuttle inference failures expose a safe status rather than model/build paths.

## Numeric boundaries

Invalid values are rejected, not silently truncated or clamped. Both snake_case
and camelCase keys are validated, even when both are supplied. Shuttle validation
runs without needing an available model, and also covers direct dataclass and
environment configuration.

| Setting | Accepted values |
|---|---|
| game type | `singles`, `doubles` |
| tracked players | integer 1–4; booleans rejected |
| frame/pose stride | integer 1–1000 |
| detector/shuttle input dimensions | integer 1–2048 |
| shuttle window | integer 2–32 |
| shuttle probability threshold | finite number 0–1 |
| centroid relative threshold | finite number greater than 0, at most 1 |
| detector confidence | existing engine constraint: greater than 0, at most 1 |
| court ROI margin | integer 0–8192 pixels; finite 0–100 meters |
| combined shuttle tensor | at most 16,777,216 FP32 elements (64 MiB) |

## Verification scope

`python -m unittest ai_service.tests.test_upload_security -v` exercises real small
OpenCV-encoded videos, bounded streamed/mock requests, replacement rollback,
concurrent upload exclusion, decoder/thread startup failures, input validation,
and one-hour metadata compatibility. No huge video assets are created. Existing
session, player and shuttle integration suites are also required.

Validated on 2026-09-23:

- Targeted upload/security, session/lifecycle and real tracking integration: 53 passed.
- Full Python unittest discovery: 371 passed, no skips.
- TypeScript (`npm run lint`, which invokes `tsc --noEmit`): passed.
- Vitest: 95 files / 864 tests passed.
- Independent read-only code review: no remaining blockers after media validation fixes.
- ESLint was attempted but cannot run: this repository has no `eslint.config.*`
  and no declared ESLint dependencies. This is an existing validation-tooling gap,
  not a passing ESLint check. The all-tools repository gate remains incomplete.

The merge of existing Phase 2 tracking work also corrected two pre-existing
TypeScript test mocks to match the API return types (session list array and video
dimensions). Neither changes production tracking behavior.

## Remaining risks

This phase imposes a per-upload limit, not an aggregate disk quota, session-count
limit, retention policy, global worker cap, or rate limit. OS crashes/power loss
can leave files; there is no startup orphan scavenger. Codec execution is not
sandboxed and there is no malware scanning. OpenCV may allocate decoder buffers
before the first frame is returned. These require separate work if needed.

At implementation baseline, SEC-0.1 exists only as a design document: the service
still binds `0.0.0.0` and has no authentication. SEC-0.2 does not establish or
redesign that security boundary and must not be represented as LAN lockdown.
