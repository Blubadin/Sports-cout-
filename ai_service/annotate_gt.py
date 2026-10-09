"""
ai_service/annotate_gt.py — Minimal Phase 3 Ground Truth Annotation Tool
Provides a strict, blinded human-review interface for bounding boxes, identities,
shuttle visibility, calibration, and scene transitions without exposing model predictions.
"""
import cv2
import json
import os
import hashlib
import argparse
from pathlib import Path
from datetime import datetime, timezone

class AnnotationTool:
    def __init__(self, video_path: str, output_path: str, reviewer_id: str, split_assignment: str, match_group: str):
        self.video_path = video_path
        self.output_path = Path(output_path)
        self.reviewer_id = reviewer_id
        self.split_assignment = split_assignment
        self.match_group = match_group
        
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")
            
        self.cap = cv2.VideoCapture(video_path)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print("Calculating SHA-256 (this may take a moment)...")
        hasher = hashlib.sha256()
        with open(video_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096 * 1024), b""):
                hasher.update(chunk)
        self.video_hash = hasher.hexdigest()
        
        self.current_frame_idx = 0
        self.annotations = {}
        
        self.metadata = {
            "sourceMediaSha256": self.video_hash,
            "recordingGroup": self.match_group,
            "primaryReviewerId": self.reviewer_id,
            "reviewDate": datetime.now(timezone.utc).isoformat(),
            "annotationMethod": "manual_point_click_v1",
            "predictionBlindingStatus": "BLINDED",
            "independentSecondReviewer": None,
            "adjudicationRecord": [],
            "annotationVersion": "1.0",
            "splitAssignment": self.split_assignment
        }
        
        self._load_existing()
        self.active_mode = "SCENE" # SCENE, PLAYER, SHUTTLE, CALIBRATION
        self.shuttle_vis = "unknown" # visible, absent, occluded, unknown
        self.active_player_id = "P1"
        self.scene_tag = "live_play"
        
        cv2.namedWindow("SportsScout GT Annotator")
        cv2.setMouseCallback("SportsScout GT Annotator", self._mouse_callback)

    def _load_existing(self):
        if self.output_path.exists():
            print(f"Loading existing annotations from {self.output_path}")
            with open(self.output_path, 'r') as f:
                data = json.load(f)
                self.metadata.update(data.get("metadata", {}))
                # Ensure we don't silently overwrite reviewer if reopened by someone else
                if self.metadata["primaryReviewerId"] != self.reviewer_id:
                    self.metadata["independentSecondReviewer"] = self.reviewer_id
                
                for k, v in data.get("frames", {}).items():
                    self.annotations[int(k)] = v

    def _save(self):
        temp_path = self.output_path.with_suffix('.tmp.json')
        data = {
            "metadata": self.metadata,
            "frames": {str(k): v for k, v in sorted(self.annotations.items())}
        }
        with open(temp_path, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_path, self.output_path)
        print(f"Saved to {self.output_path}")

    def _get_frame_anno(self):
        if self.current_frame_idx not in self.annotations:
            self.annotations[self.current_frame_idx] = {
                "timestamp": self.current_frame_idx / self.fps,
                "scene": {"tag": "live_play"},
                "players": {},
                "shuttle": {"visibility": "unknown", "x": None, "y": None},
                "calibration": []
            }
        return self.annotations[self.current_frame_idx]

    def _mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            anno = self._get_frame_anno()
            if self.active_mode == "PLAYER":
                anno["players"][self.active_player_id] = {"x": x, "y": y, "ground_x": x, "ground_y": min(y + 100, self.height)}
            elif self.active_mode == "SHUTTLE":
                anno["shuttle"] = {"visibility": "visible", "x": x, "y": y}
                self.shuttle_vis = "visible"
            elif self.active_mode == "CALIBRATION":
                anno["calibration"].append({"x": x, "y": y})
            self._render()

    def _render(self):
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, self.current_frame_idx)
        ret, frame = self.cap.read()
        if not ret:
            return

        anno = self.annotations.get(self.current_frame_idx, {})
        
        # Draw annotations
        if "shuttle" in anno and anno["shuttle"].get("visibility") == "visible":
            sx, sy = anno["shuttle"]["x"], anno["shuttle"]["y"]
            if sx is not None and sy is not None:
                cv2.circle(frame, (int(sx), int(sy)), 5, (0, 0, 255), -1)
                
        if "players" in anno:
            for pid, pdata in anno["players"].items():
                px, py = pdata["x"], pdata["y"]
                cv2.circle(frame, (int(px), int(py)), 6, (0, 255, 0), -1)
                cv2.putText(frame, pid, (int(px)+10, int(py)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                
        if "calibration" in anno:
            for pt in anno["calibration"]:
                cv2.drawMarker(frame, (int(pt["x"]), int(pt["y"])), (255, 0, 0), cv2.MARKER_CROSS, 15, 2)

        # UI Overlay
        overlay = f"Frame: {self.current_frame_idx}/{self.total_frames} | Time: {self.current_frame_idx/self.fps:.2f}s"
        cv2.putText(frame, overlay, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        mode_text = f"Mode: {self.active_mode} | Scene: {anno.get('scene', {}).get('tag', 'none')}"
        cv2.putText(frame, mode_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        if self.active_mode == "PLAYER":
            cv2.putText(frame, f"Active Player: {self.active_player_id} (Press 1-4 to switch)", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        elif self.active_mode == "SHUTTLE":
            cv2.putText(frame, f"Shuttle Vis: {anno.get('shuttle', {}).get('visibility')} (Press v=vis, b=abs, o=occ, u=unk)", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        
        cv2.imshow("SportsScout GT Annotator", frame)

    def run(self):
        self._render()
        while True:
            key = cv2.waitKey(0) & 0xFF
            
            # Navigation
            if key == ord('d'): # Next frame
                self.current_frame_idx = min(self.total_frames - 1, self.current_frame_idx + 1)
            elif key == ord('a'): # Prev frame
                self.current_frame_idx = max(0, self.current_frame_idx - 1)
            elif key == ord('e'): # Fast forward 10
                self.current_frame_idx = min(self.total_frames - 1, self.current_frame_idx + 10)
            elif key == ord('q'): # Rewind 10
                self.current_frame_idx = max(0, self.current_frame_idx - 10)
                
            # Mode switching
            elif key == ord('m'):
                modes = ["SCENE", "PLAYER", "SHUTTLE", "CALIBRATION"]
                self.active_mode = modes[(modes.index(self.active_mode) + 1) % len(modes)]
                
            # Player ID
            elif key in [ord('1'), ord('2'), ord('3'), ord('4')]:
                self.active_player_id = f"P{chr(key)}"
                self.active_mode = "PLAYER"
                
            # Shuttle Vis
            elif key in [ord('v'), ord('b'), ord('o'), ord('u')]:
                self.active_mode = "SHUTTLE"
                anno = self._get_frame_anno()
                vis_map = {'v': 'visible', 'b': 'absent', 'o': 'occluded', 'u': 'unknown'}
                anno["shuttle"]["visibility"] = vis_map[chr(key)]
                if chr(key) != 'v':
                    anno["shuttle"]["x"] = None
                    anno["shuttle"]["y"] = None
                    
            # Scene tags
            elif key == ord('t'):
                self.active_mode = "SCENE"
                anno = self._get_frame_anno()
                tags = ["live_play", "camera_cut", "replay", "close_up", "spectators", "out_of_court"]
                current = anno["scene"].get("tag", "live_play")
                idx = tags.index(current) if current in tags else -1
                anno["scene"]["tag"] = tags[(idx + 1) % len(tags)]
                
            # Save and Quit
            elif key == ord('s'):
                self._save()
            elif key == 27: # ESC
                self._save()
                break
                
            self._render()
        
        self.cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Phase 3 Blinded GT Annotation Tool")
    parser.add_argument("video", help="Path to source video")
    parser.add_argument("output", help="Path to save JSON GT")
    parser.add_argument("--reviewer", required=True, help="Reviewer ID (e.g. user@domain.com)")
    parser.add_argument("--split", required=True, choices=["development", "held-out"], help="Split assignment")
    parser.add_argument("--group", required=True, help="Recording/Match group ID to prevent leakage")
    
    args = parser.parse_args()
    tool = AnnotationTool(args.video, args.output, args.reviewer, args.split, args.group)
    tool.run()
