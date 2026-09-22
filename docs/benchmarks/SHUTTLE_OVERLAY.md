# Phase 2.5 shuttle inspection

The Lab adds a separate Off / Point / Trail / Debug selector below the video,
followed by compact wrapping diagnostics. Off is the default. Points use native
video dimensions; no court projection is applied.

Observed points are solid, predicted points are amber rings, and interpolated
points are cyan dashed rings. Historical trail marks are smaller and dimmed.
The default trail is 0.6 seconds, capped at 60 samples (configurable duration
with a two-second safety cap). Marks are not connected across missing data.

Current points require a past canonical sample, matching frame identity and
timestamp, and the same cadence-based freshness tolerance used by the player
overlay. Lost, unknown, absent, future and stale samples have no current point.
Video frame callbacks use presentation mediaTime, with existing timeupdate and
seek handlers retained for compatibility.

Observed/lost percentages count raw shuttle samples available up to playback
time. They are sample proportions, not accuracy or detection recall. Provider,
longest loss and reacquisition metrics are shown as unavailable because the
current frontend telemetry contract does not transport those backend metrics.
No player model name is reused as a shuttle model name. Old sessions remain
usable with unavailable shuttle diagnostics.

This UI consumes supplied canonical shuttle telemetry. It does not activate or
install a temporal model or wire the experimental Python tracker into the
production player worker. Real inference still requires that separate pipeline
integration and a compatible local model. Derived trajectory persistence is
also outside this UI change; any supplied predicted/interpolated sample keeps
its state, and the overlay performs no smoothing or relabelling.
