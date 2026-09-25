# DVC Dataset Foundation & Layout Protocol (Phase 3.4)

## 1. Overview & Principles
SportsScout benchmarks evaluate computer vision models (detection, court calibration, player tracking, and shuttlecock trajectories) against ground truth data without polluting the Git history with large binary video files or model weights.

### Governance Rules
1. **Never Commit Video Binaries to Git**: Video files (`.mp4`, `.mov`, `.avi`) must never be added to git version control.
2. **Never Commit Model Weights to Git**: Weights (`.pt`, `.engine`, `.onnx`) must never be checked into git.
3. **No Invented Remotes or Credentials**: Do not configure speculative cloud bucket URLs or credentials in source code.
4. **Logical References**: Datasets and clips are indexed through versioned JSON manifests referencing logical IDs and relative filenames.

---

## 2. Expected Dataset Directory Layout
When local evaluation datasets are populated for Phase 3 and Phase 2 benchmarks, they must adhere to the following directory structure:

```
datasets/
└── badminton/
    ├── manifest.json                  # Top-level dataset manifest (schemaVersion 1)
    ├── videos/
    │   ├── B01_singles_center.mp4     # Large video binaries (tracked via DVC)
    │   ├── B02_doubles_dynamic.mp4
    │   └── ...
    └── ground_truth/
        ├── cuts/
        │   ├── B01_cuts.json          # Ground truth camera cut timestamps
        │   └── ...
        ├── calibration/
        │   ├── B01_court_corners.json # 4-corner pixel annotations & valid intervals
        │   └── ...
        ├── positions/
        │   ├── B01_ground_positions.json # Ankle/ground pixel & meter coordinates
        │   └── ...
        └── identity/
            ├── B01_mot_identities.json   # Ground truth MOT player IDs per frame
            └── ...
```

---

## 3. Versioned Manifest References
Manifest entries reference videos and annotations via logical relative paths and metadata checksums:

```json
{
  "id": "B01_singles_center",
  "name": "Men's Singles Center Court",
  "venueId": "arena_national_01",
  "cameraId": "cam_rear_high",
  "sessionDate": "2026-09-20",
  "recordingGroup": "group_tournament_finals",
  "videoReference": "videos/B01_singles_center.mp4",
  "cameraType": "static_rear",
  "cameraMotion": "static",
  "resolution": "1280x720",
  "fps": 30.0,
  "calibrationGroundTruthAvailable": true,
  "playerIdentityGroundTruthAvailable": true,
  "groundPositionGroundTruthAvailable": true,
  "cameraCutGroundTruthAvailable": true
}
```

---

## 4. Setup Commands for Future DVC Initialization
When a shared team storage remote (e.g. S3, GCS, Azure Blob, or local NFS) is provisioned by infrastructure:

```bash
# 1. Initialize DVC without overriding Git hooks
dvc init --no-scm

# 2. Add remote storage (replace with authorized company remote)
# dvc remote add -d badminton-storage s3://my-sports-bucket/datasets/badminton

# 3. Track video directory
# dvc add datasets/badminton/videos

# 4. Pull dataset on evaluation runner
# dvc pull
```
