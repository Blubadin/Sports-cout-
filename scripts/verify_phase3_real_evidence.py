"""Offline contract/coverage checks on finished real-video jobs, never GT scoring."""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai_service"))
from analysis_job_store import AnalysisJobStore
from pose_coordinate_space import SUPPORTED_POSE_COORDINATE_SPACES


def verify(root, protocol):
    # This must run AFTER every worker exits: store recovery is not a live reader.
    report = json.loads((root / "report.json").read_text())
    import psutil
    for run in report["runs"]:
        for process in run["processes"]:
            pid = process.get("workerPid")
            try:
                command = " ".join(psutil.Process(pid).cmdline())
            except psutil.NoSuchProcess:
                continue
            except psutil.AccessDenied as error:
                raise RuntimeError("Cannot confirm worker exit; offline checks must wait") from error
            if "--worker" in command and str(root) in command:
                raise RuntimeError("Worker is still active; offline checks must wait")
    store = AnalysisJobStore(root / "store")
    output = {"scope": "Wire contracts and measured output availability only; no human GT accuracy",
              "protocolSha256": hashlib.file_digest((root / "protocol.json").open("rb"), "sha256").hexdigest(),
              "verifierSha256": hashlib.file_digest(Path(__file__).open("rb"), "sha256").hexdigest(),
              "checkedAtUnix": time.time(), "runs": []}
    output["serializationRoundingPolicy"] = "Feet pixels round to 0.1 px and percent to 0.01 percentage points independently; conversion bound = 0.005 + 0.05*100/dimension + 1e-9. Schema rounding allowance, not a quality threshold."
    w, h = protocol["media"]["width"], protocol["media"]["height"]
    for run in report["runs"]:
        counts, scenes, sources, states, devices, failures = (Counter() for _ in range(6))
        store.validate_committed(run["id"])
        for chunk in store.iter_chunks(run["id"]):
            for row in chunk:
                counts["frames"] += 1
                scenes[row.get("sceneState")] += 1
                devices[row.get("effectiveDevice")] += 1
                for key in ("isMetricValid", "canUseCourtMetric", "canBuildHeatmap", "canEstimateHit", "allowCanonicalWrites"):
                    counts[key] += int(row.get(key) is True)
                counts["invalidCalibrationFrames"] += int(row.get("isMetricValid") is False)
                failures["heatmapWithoutMetricOrWriteGate"] += int(row.get("canBuildHeatmap") is True and
                    (row.get("canUseCourtMetric") is not True or row.get("allowCanonicalWrites") is not True))
                failures["hitReadinessWithoutShuttleObservation"] += int(row.get("canEstimateHit") is True and row.get("shuttle") is None)
                if row.get("sceneState") == "REPLAY":
                    failures["replayCanonicalWrite"] += int(row.get("allowCanonicalWrites") is True or row.get("canWriteCanonicalMatchData") is True)
                if row.get("sceneState") in ("UNKNOWN", "CAMERA_TRANSITION"):
                    failures["unknownTransitionGateLeak"] += int(any(row.get(k) is True for k in
                        ("canTrackPlayer", "canTrackShuttle", "canUseCourtMetric", "canBuildHeatmap", "canEstimateHit", "canWriteCanonicalMatchData")))
                for player in row.get("players", []):
                    counts["playerSlots"] += 1
                    states[player.get("state")] += 1
                    sources[player.get("groundPointProvenance")] += 1
                    counts["observedPlayers"] += int(player.get("state") == "observed")
                    counts["courtPositions"] += int(player.get("courtPositionM") is not None)
                    if row.get("isMetricValid") is False:
                        failures["invalidCalibrationMetricLeak"] += int(any(player.get(k) is not None for k in
                            ("courtPosition", "courtPositionM", "groundPositionM", "speedMps", "absoluteZone", "playerRelativeZone")))
                    pose = player.get("pose")
                    if isinstance(pose, dict) and pose.get("keypoints"):
                        failures["unknownPoseUnits"] += int(pose.get("keypointCoordinateSpace") not in SUPPORTED_POSE_COORDINATE_SPACES)
                    for name in ("leftFoot", "rightFoot"):
                        foot = player.get(name)
                        if not isinstance(foot, dict) or foot.get("positionPx") is None:
                            continue
                        counts["feetPixelMeasurements"] += 1
                        px, pct = foot["positionPx"], foot.get("positionPct")
                        valid = all(type(px.get(k)) in (int, float) and math.isfinite(px[k]) for k in ("x", "y"))
                        failures["invalidFeetPixelBounds"] += int(not valid or not (0 <= px["x"] < w and 0 <= px["y"] < h))
                        if valid:
                            failures["feetPixelPercentConversionMismatch"] += int(pct is None or
                                abs(pct["x"] - px["x"] * 100 / w) > 0.005 + 0.05 * 100 / w + 1e-9 or
                                abs(pct["y"] - px["y"] * 100 / h) > 0.005 + 0.05 * 100 / h + 1e-9)
                counts["shuttleObservationRows"] += int(row.get("shuttle") is not None)
        output["runs"].append({"id": run["id"], "status": "PASS" if not any(failures.values()) else "FAIL",
            "violations": dict(failures), "counts": dict(counts), "sceneCounts": dict(scenes),
            "playerStateCounts": dict(states), "groundSourceCounts": dict(sources), "effectiveDeviceCounts": dict(devices),
            "contractCheckCoverage": {"replayFrames": scenes["REPLAY"],
                "unknownTransitionFrames": scenes["UNKNOWN"] + scenes["CAMERA_TRANSITION"],
                "invalidCalibrationFrames": counts["invalidCalibrationFrames"],
                "feetConversionSamples": counts["feetPixelMeasurements"]},
            "validityCoverage": {
                "courtMetricAvailableFrameFraction": counts["canUseCourtMetric"] / counts["frames"] if counts["frames"] else None,
                "observedPlayerSlotFraction": counts["observedPlayers"] / counts["playerSlots"] if counts["playerSlots"] else None,
                "courtPositionAvailableSlotFraction": counts["courtPositions"] / counts["playerSlots"] if counts["playerSlots"] else None,
                "shuttleMeasurementFraction": None if not protocol["processingConfig"]["shuttleEnabled"] else counts["shuttleObservationRows"] / counts["frames"],
                "shuttleUnavailableReason": "Provider disabled: missing pinned model artifact" if not protocol["processingConfig"]["shuttleEnabled"] else None,
            }, "gtAccuracyStatus": "NOT VALIDATED", "manualCorrectionPersistence": "NOT VALIDATED"})
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = verify(args.root.resolve(), json.loads((args.root / "protocol.json").read_text()))
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"results": [(r["id"], r["status"]) for r in result["runs"]]}))
    sys.exit(1 if any(r["status"] == "FAIL" for r in result["runs"]) else 0)
