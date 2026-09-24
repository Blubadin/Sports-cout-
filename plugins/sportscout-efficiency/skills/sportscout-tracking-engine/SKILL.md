---
name: sportscout-tracking-engine
description: Apply SPORTSCOUT tracking-domain invariants when modifying player, pose, shuttle, court-mapping, ReID, heatmap, or real-video analysis code.
---

# SPORTSCOUT tracking invariants

- Detector detections are not tracker identities. Keep ByteTrack/MOT `trackId` separate from semantic P1/P2/P3/P4 player identity; never substitute `trackId = playerId`.
- Production tracking uses decoded real video frames. Synthetic/demo data must not be persisted or presented as real analysis. Do not fabricate confidence, accuracy, benchmarks, FPS, latency, or quality.
- Keep shuttle state explicit: observed, predicted/interpolated, or lost/unknown. Never present predictions as direct observations.
- Preserve calibrated court/heatmap conversion and distinguish image pixels, normalized coordinates, and court coordinates at every boundary.
- Monocular video supports 2D estimates only unless validated additional information exists. Do not claim true 3D kinematics, ground-reaction forces, joint torque, or absolute physical measurements from ordinary monocular footage.
- Before performance work, measure the same workload, identify the bottleneck, change one thing, and benchmark again. Do not assume GPU, detector, pose, decoding, rendering, or I/O is the bottleneck.

For tracking tasks, read only the smallest required pipeline segment: UI plus API contract for a UI bug, detector/pipeline plus focused tests for a detector bug, and the identity/tracker path for a ReID bug.
