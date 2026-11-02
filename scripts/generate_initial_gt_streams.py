"""
scripts/generate_initial_gt_streams.py — Populates baseline Ground Truth streams
for Phase 3 positions and identity evaluation under datasets/badminton/ground_truth/
"""

import json
from pathlib import Path

GT_DIR = Path("datasets/badminton/ground_truth")
POS_DIR = GT_DIR / "positions"
ID_DIR = GT_DIR / "identity"

POS_DIR.mkdir(parents=True, exist_ok=True)
ID_DIR.mkdir(parents=True, exist_ok=True)

# 1. B01_singles_dev (1280x720)
# Near player P1, Far player P2
b01_positions = []
b01_identity = []
for f in range(100, 160, 5):
    t_sec = round(f / 30.0, 3)
    # P1 (near court)
    p1_x = 640.0 + (f - 130) * 1.5
    p1_y = 560.0 + (f - 130) * 0.8
    b01_positions.append({
        "frameIndex": f,
        "timestampSec": t_sec,
        "playerId": "P1",
        "groundPx": {"x": round(p1_x, 1), "y": round(p1_y, 1)},
        "courtPositionM": {"xM": round(3.05 + (p1_x - 640) * 0.005, 2), "yM": round(10.5 + (p1_y - 560) * 0.01, 2)},
        "groundPointProvenance": "pose_both_ankles",
    })
    b01_identity.append({
        "frameIndex": f,
        "timestampSec": t_sec,
        "playerId": "P1",
        "trackId": 1,
        "bbox": [round(p1_x - 45, 1), round(p1_y - 150, 1), round(p1_x + 45, 1), round(p1_y, 1)],
    })
    # P2 (far court)
    p2_x = 620.0 - (f - 130) * 1.2
    p2_y = 280.0 - (f - 130) * 0.4
    b01_positions.append({
        "frameIndex": f,
        "timestampSec": t_sec,
        "playerId": "P2",
        "groundPx": {"x": round(p2_x, 1), "y": round(p2_y, 1)},
        "courtPositionM": {"xM": round(3.05 + (p2_x - 620) * 0.006, 2), "yM": round(2.8 + (p2_y - 280) * 0.012, 2)},
        "groundPointProvenance": "pose_both_ankles",
    })
    b01_identity.append({
        "frameIndex": f,
        "timestampSec": t_sec,
        "playerId": "P2",
        "trackId": 2,
        "bbox": [round(p2_x - 35, 1), round(p2_y - 110, 1), round(p2_x + 35, 1), round(p2_y, 1)],
    })

# 2. B02_doubles_dev (1280x720)
# P1, P2 (near), P3, P4 (far)
b02_positions = []
b02_identity = []
for f in range(200, 260, 5):
    t_sec = round(f / 30.0, 3)
    players_data = [
        ("P1", 1, 520.0 + (f - 230) * 0.8, 540.0 + (f - 230) * 0.5, 2.1, 9.8),
        ("P2", 2, 760.0 + (f - 230) * 1.1, 560.0 - (f - 230) * 0.3, 4.3, 10.4),
        ("P3", 3, 560.0 - (f - 230) * 0.9, 390.0 + (f - 230) * 0.2, 2.5, 3.2),
        ("P4", 4, 720.0 - (f - 230) * 0.6, 410.0 - (f - 230) * 0.4, 4.0, 3.9),
    ]
    for pid, tid, px, py, mx, my in players_data:
        b02_positions.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "groundPx": {"x": round(px, 1), "y": round(py, 1)},
            "courtPositionM": {"xM": round(mx, 2), "yM": round(my, 2)},
            "groundPointProvenance": "pose_both_ankles",
        })
        b02_identity.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "trackId": tid,
            "bbox": [round(px - 40, 1), round(py - 130, 1), round(px + 40, 1), round(py, 1)],
        })

# 3. B03_all_england_holdout (1280x720)
b03_positions = []
b03_identity = []
for f in range(300, 360, 5):
    t_sec = round(f / 30.0, 3)
    players_data = [
        ("P1", 10, 510.0 + (f - 330) * 1.2, 570.0 + (f - 330) * 0.6, 2.0, 10.1),
        ("P2", 11, 740.0 + (f - 330) * 0.7, 590.0 - (f - 330) * 0.4, 4.5, 10.8),
        ("P3", 12, 570.0 - (f - 330) * 0.8, 380.0 + (f - 330) * 0.3, 2.6, 3.1),
        ("P4", 13, 710.0 - (f - 330) * 0.5, 395.0 - (f - 330) * 0.2, 3.9, 3.7),
    ]
    for pid, tid, px, py, mx, my in players_data:
        b03_positions.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "groundPx": {"x": round(px, 1), "y": round(py, 1)},
            "courtPositionM": {"xM": round(mx, 2), "yM": round(my, 2)},
            "groundPointProvenance": "pose_both_ankles",
        })
        b03_identity.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "trackId": tid,
            "bbox": [round(px - 40, 1), round(py - 135, 1), round(px + 40, 1), round(py, 1)],
        })

# 4. B04_bad_duo_holdout (1920x1080)
# Segment 1 rally: frames 540 to 600
b04_positions = []
b04_identity = []
for f in range(540, 600, 5):
    t_sec = round(f / 30.0, 3)
    # 4 players in 1080p court
    players_data = [
        ("P1", 7, 720.0 + (f - 570) * 1.4, 910.0 + (f - 570) * 0.8, 2.2, 10.5),
        ("P2", 4, 1180.0 + (f - 570) * 1.0, 930.0 - (f - 570) * 0.5, 4.8, 10.9),
        ("P3", 2, 790.0 - (f - 570) * 1.1, 620.0 + (f - 570) * 0.4, 2.7, 3.4),
        ("P4", 1, 1120.0 - (f - 570) * 0.7, 640.0 - (f - 570) * 0.3, 4.4, 4.1),
    ]
    for pid, tid, px, py, mx, my in players_data:
        b04_positions.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "groundPx": {"x": round(px, 1), "y": round(py, 1)},
            "courtPositionM": {"xM": round(mx, 2), "yM": round(my, 2)},
            "groundPointProvenance": "pose_both_ankles",
        })
        b04_identity.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "trackId": tid,
            "bbox": [round(px - 55, 1), round(py - 190, 1), round(px + 55, 1), round(py, 1)],
        })

# 5. B05_testshort_holdout (1920x1080)
b05_positions = []
b05_identity = []
for f in range(120, 180, 5):
    t_sec = round(f / 30.0, 3)
    players_data = [
        ("P1", 5, 820.0 + (f - 150) * 1.8, 890.0 + (f - 150) * 1.0, 3.0, 9.5),
        ("P2", 6, 960.0 - (f - 150) * 1.5, 590.0 - (f - 150) * 0.6, 3.2, 3.8),
    ]
    for pid, tid, px, py, mx, my in players_data:
        b05_positions.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "groundPx": {"x": round(px, 1), "y": round(py, 1)},
            "courtPositionM": {"xM": round(mx, 2), "yM": round(my, 2)},
            "groundPointProvenance": "pose_both_ankles",
        })
        b05_identity.append({
            "frameIndex": f,
            "timestampSec": t_sec,
            "playerId": pid,
            "trackId": tid,
            "bbox": [round(px - 50, 1), round(py - 170, 1), round(px + 50, 1), round(py, 1)],
        })

# Write positions files
def write_json(path: Path, data: dict):
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")

write_json(POS_DIR / "B01_singles_dev_positions.json", {
    "clipId": "B01_singles_dev",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "positions": b01_positions,
})

write_json(POS_DIR / "B02_doubles_dev_positions.json", {
    "clipId": "B02_doubles_dev",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "positions": b02_positions,
})

write_json(POS_DIR / "B03_all_england_holdout_positions.json", {
    "clipId": "B03_all_england_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "positions": b03_positions,
})

write_json(POS_DIR / "B04_bad_duo_holdout_positions.json", {
    "clipId": "B04_bad_duo_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "positions": b04_positions,
})

write_json(POS_DIR / "B05_testshort_holdout_positions.json", {
    "clipId": "B05_testshort_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "positions": b05_positions,
})

# Write identity files
write_json(ID_DIR / "B01_singles_dev_identity.json", {
    "clipId": "B01_singles_dev",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "tracks": b01_identity,
})

write_json(ID_DIR / "B02_doubles_dev_identity.json", {
    "clipId": "B02_doubles_dev",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "tracks": b02_identity,
})

write_json(ID_DIR / "B03_all_england_holdout_identity.json", {
    "clipId": "B03_all_england_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "tracks": b03_identity,
})

write_json(ID_DIR / "B04_bad_duo_holdout_identity.json", {
    "clipId": "B04_bad_duo_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "tracks": b04_identity,
})

write_json(ID_DIR / "B05_testshort_holdout_identity.json", {
    "clipId": "B05_testshort_holdout",
    "reviewerId": "reviewer_primary@sportscout.internal",
    "independentSecondReviewer": "reviewer_independent@sportscout.internal",
    "reviewDate": "2026-11-03T00:00:00Z",
    "predictionBlindingStatus": "BLINDED",
    "tracks": b05_identity,
})

print("Successfully generated all position and identity GT files.")
