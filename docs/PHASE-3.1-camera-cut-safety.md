# Phase 3.1 camera cut safety

The Python analyzer compares consecutive decoded frames at 96 × 72 pixels. It
requires a strong change in court line structure across at least ten of sixteen
image regions, or a large color change supported by the same distributed
structure evidence. An eight-frame cooldown prevents one transition from
creating several camera segments. A return to the preceding view or another
very strong distinct transition can still open a new segment during cooldown.
Accepting a new calibration rearms detection immediately, so a second cut
cannot keep that new homography active. This is a conservative, deterministic
guard; subtle pans, zooms, fades, and cuts between visually similar views may not be
detected. A nearly complete brightness inversion between featureless frames is
also treated as a cut; an extreme full-frame flash may therefore cause a false
cut. The thresholds are a baseline, not a broadcast accuracy claim.

The first frame belongs to `segment-0`. A confirmed cut increments the segment
number, archives the prior calibration provenance, clears the active calibration
ID, invalidates `H` and `H_inv`, and breaks metric trajectory continuity before
tracking that frame. Player bounding boxes, pose, shuttle observations, and raw
MOT IDs still flow through telemetry when freshly observed. Cached boxes, poses,
and raw MOT assignments from the old view are cleared at the cut. Court
position, metric speed, and zones remain unavailable until manual four-corner
calibration creates a new
calibration ID for the current segment. Accumulated distance is retained but
does not bridge the cut or the new calibration.

The session calibration endpoint accepts manual recovery while a session is
processing only when calibration is lost and the requested game type matches
the session. Recovery requests must name the current camera segment. The
Tracking Lab offers a four-corner recovery control while the segment is lost.
Analyzer updates and calibration requests share a lock. Existing saved telemetry
remains schema version 1; no stored session migration is needed.
Automatic court geometry and relocking belong to Phase 3.2.

Manual recovery is available while a session is processing. A completed upload
cannot be resumed from its cut frame in this phase; its existing lost interval
remains without metric analytics.
