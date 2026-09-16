import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
import cv2
import numpy as np
sys.path.insert(0, str(Path(__file__).parent.parent))
from analyzer_v2 import BadmintonAnalyzerV2
from server import app, tracking_sessions
from fastapi.testclient import TestClient

class RealTrackingTests(unittest.TestCase):
    def test_track_confidence_and_pose_are_actual_observations(self):
        analyzer = BadmintonAnalyzerV2(game_type='singles')
        analyzer.set_court_corners([[0,0],[200,0],[200,100],[0,100]])
        analyzer.detect_and_track = Mock(return_value=[{'bbox':[20,10,60,30], 'center':(40,30), 'conf':0.73, 'track_id':42}])
        analyzer._pose_detector = Mock()
        analyzer._pose_detector.estimate_pose_in_roi.return_value = {'keypoints':[[40,20,0.61]], 'metrics':{'stance_width_px':10}}
        frame=np.zeros((100,200,3),dtype=np.uint8)
        player=analyzer.process_frame(frame)['players'][0]
        self.assertEqual(player['trackId'],42)
        self.assertEqual(player['detectionConfidence'],0.73)
        self.assertEqual(player['pose']['keypoints'],[{'x':20.0,'y':20.0,'score':0.61}])
        analyzer.detect_and_track.return_value=[]
        missed=analyzer.process_frame(frame)['players'][0]
        self.assertNotIn('pose',missed)
        self.assertEqual(missed['detectionConfidence'],0)

    def test_detector_uses_persistent_bytetrack(self):
        analyzer=BadmintonAnalyzerV2()
        analyzer._detector=Mock()
        analyzer._detector.track.return_value=[]
        analyzer.detect_and_track(np.zeros((100,200,3),dtype=np.uint8))
        self.assertTrue(analyzer._detector.track.call_args.kwargs['persist'])
        self.assertEqual(analyzer._detector.track.call_args.kwargs['tracker'],'bytetrack.yaml')

    def test_upload_decodes_and_delete_cleans_owned_video(self):
        client=TestClient(app)
        sid=client.post('/api/tracking/sessions',json={'video_source':'upload'}).json()['sessionId']
        with tempfile.TemporaryDirectory() as folder:
            path=str(Path(folder)/'clip.avi')
            writer=cv2.VideoWriter(path,cv2.VideoWriter_fourcc(*'MJPG'),15,(64,48))
            writer.write(np.full((48,64,3),100,dtype=np.uint8)); writer.release()
            response=client.post(f'/api/tracking/sessions/{sid}/video',content=Path(path).read_bytes(),headers={'Content-Type':'video/x-msvideo'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['width'],64)
        self.assertEqual(response.json()['height'],48)
        owned=Path(tracking_sessions[sid].video_source)
        self.assertTrue(owned.exists())
        client.delete(f'/api/tracking/sessions/{sid}')
        self.assertFalse(owned.exists())

    def test_upload_rejects_non_video(self):
        client=TestClient(app)
        sid=client.post('/api/tracking/sessions',json={'video_source':'upload'}).json()['sessionId']
        response=client.post(f'/api/tracking/sessions/{sid}/video',content=b'not video')
        self.assertEqual(response.status_code,422)
        client.delete(f'/api/tracking/sessions/{sid}')
