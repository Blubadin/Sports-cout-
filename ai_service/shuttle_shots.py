"""Conservative shot lifecycle. Measured points and reviewed terminal evidence only.

Image homography is not a 3D shuttle flight model. Metric positions must be supplied
by a validated measurement source; never project arbitrary airborne detections.
"""
from __future__ import annotations
from collections import Counter, deque
from math import hypot, isfinite

LANDING_OUTCOMES = {"CONFIRMED_LANDING", "PROBABLE_LANDING", "OUT_SIDE", "OUT_LONG", "NET"}
ZONES = [f"{depth}_{side}" for depth in ("FRONT", "MID", "REAR") for side in ("LEFT", "CENTER", "RIGHT")]


def landing_zone(point, game_type="doubles"):
    x, y = point
    left, right = (.46, 5.64) if game_type == "singles" else (0., 6.1)
    if x < left or x > right:
        return "OUT_SIDE", "SIDE_OUT"
    if y < 0 or y > 13.4:
        return "OUT_LONG", "LONG_OUT"
    depth = min(y, 13.4 - y)
    name = "FRONT" if depth >= 4.72 else "MID" if depth >= 2.36 else "REAR"
    side = ("LEFT", "CENTER", "RIGHT")[min(2, int((x - left) / ((right - left) / 3)))]
    legacy = {"FRONT": "F", "MID": "M", "REAR": "B"}[name] + ("L" if x < (left + right) / 2 else "R")
    return f"{name}_{side}", legacy


def point(value):
    if isinstance(value, dict):
        value = (value.get("xM", value.get("x")), value.get("yM", value.get("y")))
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        if all(isinstance(v, (float, int)) and not isinstance(v, bool) and isfinite(v) for v in value[:2]):
            return tuple(value[:2])
    return None


class ShuttleShotTracker:
    def __init__(self, game_type="doubles", max_absence_sec=4.0):
        self.game_type = game_type
        self.max_absence_sec = max_absence_sec
        self.active = None
        self.sequence = 0
        self.rally_sequence = 0
        self.segment = None
        self.history = deque(maxlen=3)
        self.visibility = "LOST"
        self.exit = None

    def _finish(self, frame, outcome="UNKNOWN", evidence=None):
        shot = self.active
        if shot is None:
            return None
        shot.update(endFrame=frame.get("sourceFrame", frame.get("frameIndex")), endTimestampSec=frame["timestampSec"], outcome=outcome)
        if evidence and outcome in LANDING_OUTCOMES:
            shot["landingConfirmed"] = outcome in ("CONFIRMED_LANDING", "OUT_SIDE", "OUT_LONG")
            px = point(evidence.get("positionPx"))
            metric = point(evidence.get("positionM")) if frame.get("isMetricValid") is True else None
            shot["landingPositionPx"] = {"x": px[0], "y": px[1]} if px else None
            shot["landingPositionM"] = {"xM": metric[0], "yM": metric[1]} if metric else None
            if metric:
                shot["landingZone"], shot["legacyLandingZone"] = landing_zone(metric, self.game_type)
                if outcome == "CONFIRMED_LANDING" and shot["landingZone"] in ("OUT_SIDE", "OUT_LONG"):
                    shot["outcome"] = shot["landingZone"]
            shot["confidence"] = min(shot["confidence"], evidence["confidence"])
        self.active = None
        self.exit = None
        return shot

    def update(self, frame, width, height):
        """Returns changed shot snapshots. No loss event can create a landing."""
        changed = []
        t = frame["timestampSec"]
        segment = frame.get("cameraSegmentId")
        if self.segment is not None and segment != self.segment:
            ended = self._finish(frame)
            if ended:
                changed.append(ended)
            self.history.clear()
            self.visibility = "LOST"
        self.segment = segment
        if frame.get("sceneState") in ("REPLAY", "CAMERA_TRANSITION", "CLOSE_UP", "UNKNOWN"):
            ended = self._finish(frame)
            if ended:
                changed.append(ended)
            self.history.clear()
            self.visibility = "LOST"
            return {"visibility": "LOST", "measuredPositionPx": None, "continuity": None, "shots": changed}
        obs = frame.get("shuttle") or {}
        px = point(obs.get("positionPx")) if obs.get("state") == "observed" else None
        contact = frame.get("shuttleContactEvidence")
        # Contact inference is deliberately conservative: observed velocity reversal
        # plus a unique fresh wrist close to the shuttle; no bbox/ground proximity.
        if contact is None and px and (obs.get("confidence") or 0) >= .75 and len(self.history) >= 2 and frame.get("sceneState") == "COURT_PLAY":
            a, b = self.history[-2], self.history[-1]
            v1 = (b[1][0] - a[1][0], b[1][1] - a[1][1])
            v2 = (px[0] - b[1][0], px[1] - b[1][1])
            scale = max(width, height)
            if min(a[3] or 0, b[3] or 0) >= .75 and t - a[0] <= .25 and hypot(*v1) > .005 * scale and hypot(*v2) > .005 * scale and v1[0]*v2[0]+v1[1]*v2[1] < -.3*hypot(*v1)*hypot(*v2):
                candidates = []
                for player in frame.get("players", []):
                    pose = player.get("pose") or {}
                    if player.get("state") != "observed" or player.get("poseSource") != "fresh" or player.get("isPoseStale") or (player.get("detectionConfidence") or 0) < .75:
                        continue
                    kps = pose.get("keypoints") or []
                    for wrist in kps[9:11]:
                        wp = point(wrist)
                        score = wrist.get("score", 0) if isinstance(wrist, dict) else wrist[2]
                        if wp and score >= .75:
                            if pose.get("keypointCoordinateSpace") == "normalized_percent":
                                wp = (wp[0]*width/100, wp[1]*height/100)
                            if hypot(wp[0]-b[1][0], wp[1]-b[1][1]) <= .025 * scale:
                                candidates.append(player["playerId"])
                if len(set(candidates)) == 1:
                    contact = {"confidence": .8, "hitterPlayerId": candidates[0], "semanticConfidence": .8, "kind": "WRIST_VELOCITY_REVERSAL", "positionPx": b[1], "timestampSec": b[0], "frame": b[2]}
        valid_contact = bool(contact and contact.get("confidence", 0) >= .8 and px and frame.get("sceneState") in ("COURT_PLAY", "COURT_IDLE"))
        if valid_contact:
            if self.active and t - self.active["contactTimestampSec"] >= .12:
                contact_frame = dict(frame, timestampSec=contact.get("timestampSec", t), sourceFrame=contact.get("frame", frame.get("sourceFrame", frame.get("frameIndex"))))
                changed.append(self._finish(contact_frame, "RETURNED"))
            if self.active is None:
                if not changed or changed[-1]["outcome"] != "RETURNED":
                    self.rally_sequence += 1
                self.sequence += 1
                metric = point(contact.get("positionM")) if frame.get("isMetricValid") is True else None
                contact_px = point(contact.get("positionPx")) or px
                self.active = dict(shotId=f"{segment}:shot-{self.sequence}", rallyId=f"{segment}:rally-{self.rally_sequence}",
                    hitterPlayerId=contact.get("hitterPlayerId") if contact.get("semanticConfidence", 0) >= .8 else None,
                    contactFrame=contact.get("frame", frame.get("sourceFrame", frame.get("frameIndex"))), contactTimestampSec=contact.get("timestampSec", t),
                    contactPositionPx={"x": contact_px[0], "y": contact_px[1]}, contactPositionM={"xM": metric[0], "yM": metric[1]} if metric else None,
                    endFrame=None, endTimestampSec=None, landingPositionPx=None, landingPositionM=None, landingZone=None,
                    outcome="UNKNOWN", confidence=contact["confidence"], outOfFrame=False, reacquired=False,
                    contactEvidence=contact.get("kind", "EXPLICIT_CONTACT_EVIDENCE"))
        if px:
            if self.exit:
                edge = self._edge(px, width, height)
                elapsed = t - self.exit["timestampSec"]
                last_px = point(self.exit["positionPx"])
                entry_velocity = ((px[0]-last_px[0])/max(.001, elapsed), (px[1]-last_px[1])/max(.001, elapsed))
                entry_direction = {"TOP": entry_velocity[1] >= 0, "BOTTOM": entry_velocity[1] <= 0, "LEFT": entry_velocity[0] >= 0, "RIGHT": entry_velocity[0] <= 0}.get(edge, False)
                exit_speed = hypot(*self.exit["velocityPxPerSec"])
                compatible = (elapsed <= self.max_absence_sec and edge == self.exit["edge"] and segment == self.exit["cameraSegmentId"]
                              and self.active is not None and frame.get("sceneState") == "COURT_PLAY"
                              and entry_direction and hypot(*entry_velocity) <= max(width, height) * 2 + exit_speed)
                if compatible:
                    self.visibility = "REACQUIRED"
                    self.active["reacquired"] = True
                else:
                    ended = self._finish(frame)
                    if ended:
                        changed.append(ended)
                    self.visibility = "OBSERVED"
                self.exit = None
            else:
                self.visibility = "OBSERVED"
            self.history.append((t, px, frame.get("sourceFrame", frame.get("frameIndex")), obs.get("confidence")))
            edge = self._edge(px, width, height)
            if edge and len(self.history) >= 2:
                before = self.history[-2]
                dt = t - before[0]
                velocity = ((px[0]-before[1][0])/dt, (px[1]-before[1][1])/dt) if dt > 0 else (0, 0)
                outward = {"TOP": velocity[1] < 0, "BOTTOM": velocity[1] > 0, "LEFT": velocity[0] < 0, "RIGHT": velocity[0] > 0}[edge]
                if outward:
                    self.visibility = "EXITING_FRAME"
                    self.exit = dict(edge=edge, timestampSec=t, positionPx={"x": px[0], "y": px[1]}, velocityPxPerSec=velocity, cameraSegmentId=segment,
                                     shotId=self.active["shotId"] if self.active else None, rallyId=self.active["rallyId"] if self.active else None)
        else:
            self.visibility = "OUT_OF_FRAME" if self.exit and t-self.exit["timestampSec"] <= self.max_absence_sec else "LOST"
            if self.active:
                last = self.history[-1][0] if self.history else self.active["contactTimestampSec"]
                if t-last > self.max_absence_sec:
                    changed.append(self._finish(frame))
        terminal = frame.get("shuttleTerminalEvidence")
        if terminal and terminal.get("outcome") in LANDING_OUTCOMES and terminal.get("confidence", 0) >= .8 and terminal.get("kind") in ("REVIEWED_LANDING", "GROUND_CONTACT", "REVIEWED_NET", "REVIEWED_OUT"):
            ended = self._finish(frame, terminal["outcome"], terminal)
            if ended:
                changed.append(ended)
        if self.active:
            if self.visibility == "OUT_OF_FRAME":
                self.active["outOfFrame"] = True
            changed.append(dict(self.active))
        return {"visibility": self.visibility, "measuredPositionPx": {"x": px[0], "y": px[1]} if px else None,
                "continuity": dict(self.exit) if self.exit else None, "shots": changed}

    @staticmethod
    def _edge(px, width, height):
        margin = .04 * max(width, height)
        x, y = px
        if y <= margin:
            return "TOP"
        if y >= height-margin:
            return "BOTTOM"
        if x <= margin:
            return "LEFT"
        if x >= width-margin:
            return "RIGHT"
        return None


def collect_shots(frames):
    shots = {}
    for frame in frames:
        for shot in (frame.get("shuttleShotEvents") or {}).get("shots", []):
            shots[shot["shotId"]] = dict(shot)
    return list(shots.values())


def shot_analytics(shots, hitter=None):
    if hitter:
        shots = [s for s in shots if s.get("hitterPlayerId") == hitter and s.get("confidence", 0) >= .8]
    confirmed = [s for s in shots if (s.get("landingConfirmed") or s["outcome"] == "CONFIRMED_LANDING") and s.get("landingPositionM")]
    in_court = [s for s in confirmed if s.get("landingZone") in ZONES]
    counts = Counter(s["landingZone"] for s in in_court)
    outcomes = Counter(s["outcome"] for s in shots)
    return dict(detectedShots=len(shots), outOfFrameShots=sum(s.get("outOfFrame", False) for s in shots),
        reacquiredShots=sum(s.get("reacquired", False) for s in shots), confirmedLandings=len(confirmed),
        unknownLandings=outcomes["UNKNOWN"], returnedShots=outcomes["RETURNED"],
        landingAnalyticsCoverage=len(confirmed)/len(shots) if shots else 0.0,
        landingCountByZone={z: counts[z] for z in ZONES},
        landingPercentageByZone={z: 100*counts[z]/len(in_court) if in_court else 0 for z in ZONES},
        MostTargetedZone=counts.most_common(1)[0][0] if counts else None,
        outcomes={"IN": outcomes["CONFIRMED_LANDING"], **{k: outcomes[k] for k in ("PROBABLE_LANDING", "OUT_SIDE", "OUT_LONG", "NET", "RETURNED", "UNKNOWN")}},
        status="AVAILABLE" if confirmed else "INSUFFICIENT_SHUTTLE_METRIC_DATA")
