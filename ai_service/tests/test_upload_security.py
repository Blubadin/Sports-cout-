"""SEC-0.2: bounded uploads, transactional ownership and safe request failures."""

import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock

import cv2
import numpy as np
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
import server
from shuttle_pipeline import ShuttlePipelineConfig, create_shuttle_pipeline
from ai_service.shuttle_tracker import (
    ShuttleTrackerProvider, ProviderAvailability, RuntimeUnavailableError,
    ModelUnavailableError, ShuttleInferenceError,
)


class UploadSecurityTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.source = self.root / "match.avi"
        writer = cv2.VideoWriter(str(self.source), cv2.VideoWriter_fourcc(*"MJPG"), 30, (64, 48))
        self.assertTrue(writer.isOpened())
        for _ in range(3):
            writer.write(np.full((48, 64, 3), 80, dtype=np.uint8))
        writer.release()
        self.video = self.source.read_bytes()
        self.client = TestClient(server.app)
        self.sid = self.client.post('/api/tracking/sessions', json={
            'video_source': 'upload', 'device': 'cpu',
        }).json()['sessionId']
        self.session = server.tracking_sessions[self.sid]
        self.addCleanup(server.tracking_sessions.pop, self.sid, None)
        factory = tempfile.NamedTemporaryFile
        self.writes = []
        def tracked_tempfile(**kwargs):
            target = factory(dir=self.root, **kwargs)
            target.write = Mock(wraps=target.write)
            self.writes.append(target.write)
            return target
        self.temp_patch = patch('server.tempfile.NamedTemporaryFile', side_effect=tracked_tempfile)
        self.temp_patch.start()
        self.addCleanup(self.temp_patch.stop)

    def upload(self, payload=None, **kwargs):
        return self.client.post(f'/api/tracking/sessions/{self.sid}/video?filename=match.avi',
                                content=self.video if payload is None else payload, **kwargs)

    def owned_files(self):
        return list(self.root.glob('sportscout_*'))

    def test_oversized_content_length_rejected_before_tempfile(self):
        with patch.dict(os.environ, {'SPORTSCOUT_AI_MAX_UPLOAD_BYTES': '10'}):
            response = self.upload(b'x', headers={'Content-Length': '11'})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.temp_patch.target.NamedTemporaryFile.call_count, 0)
        self.assertEqual(self.owned_files(), [])
        self.assertFalse(self.session._uploading)

    def test_stream_limit_without_length_and_lying_length_removes_partial(self):
        for headers in ([], [(b'content-length', b'1')]):
            with self.subTest(headers=headers), patch.dict(os.environ, {'SPORTSCOUT_AI_MAX_UPLOAD_BYTES': '5'}):
                written_sizes = []
                async def receive():
                    if not written_sizes:
                        written_sizes.append(0)
                        return {'type': 'http.request', 'body': b'1234', 'more_body': True}
                    written_sizes.append(self.owned_files()[0].stat().st_size)
                    return {'type': 'http.request', 'body': b'5678', 'more_body': False}
                request = Request({'type': 'http', 'headers': headers, 'query_string': b''}, receive)
                with self.assertRaises(HTTPException) as caught:
                    asyncio.run(server.upload_session_video(self.sid, request))
                self.assertEqual(caught.exception.status_code, 413)
                self.assertEqual([call.args[0] for call in self.writes[-1].call_args_list], [b'1234'])
                self.assertEqual(self.owned_files(), [])
                self.assertFalse(self.session._uploading)

    def test_exact_limit_valid_video_accepted_and_delete_cleans_owned_only(self):
        with patch.dict(os.environ, {'SPORTSCOUT_AI_MAX_UPLOAD_BYTES': str(len(self.video))}):
            response = self.upload(headers={'Content-Type': 'application/octet-stream'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['width'], 64)
        owned = self.session.owned_video_path
        self.assertTrue(owned.is_file())
        self.assertEqual(self.client.delete(f'/api/tracking/sessions/{self.sid}').status_code, 200)
        self.assertFalse(owned.exists())
        self.assertTrue(self.source.exists())

    def test_invalid_video_removed_despite_video_mime_and_extension(self):
        response = self.upload(b'not a video', headers={'Content-Type': 'video/mp4'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.owned_files(), [])
        self.assertIsNone(self.session.owned_video_path)

    def test_still_image_disguised_as_video_is_rejected_and_removed(self):
        for extension in ('.png', '.jpg', '.bmp', '.tiff', '.webp', '.ppm'):
            with self.subTest(extension=extension):
                encoded, data = cv2.imencode(extension, np.zeros((48, 64, 3), dtype=np.uint8))
                self.assertTrue(encoded)
                response = self.upload(data.tobytes(), headers={'Content-Type': 'video/mp4'})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(self.owned_files(), [])

    def test_video_header_without_decodable_container_is_rejected(self):
        response = self.upload(b'RIFF\x20\x00\x00\x00AVI ' + b'not a video')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.owned_files(), [])

    def test_real_mp4_with_untrusted_filename_and_mime_is_accepted(self):
        path = self.root / 'short.mp4'
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), 30, (64, 48))
        self.assertTrue(writer.isOpened())
        for _ in range(3):
            writer.write(np.full((48, 64, 3), 100, dtype=np.uint8))
        writer.release()
        response = self.client.post(f'/api/tracking/sessions/{self.sid}/video?filename=untrusted.txt',
                                    content=path.read_bytes(), headers={'Content-Type': 'text/plain'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['width'], 64)

    def test_replace_removes_previous_owned_file(self):
        self.assertEqual(self.upload().status_code, 200)
        previous = self.session.owned_video_path
        self.assertEqual(self.upload().status_code, 200)
        self.assertFalse(previous.exists())
        self.assertTrue(self.session.owned_video_path.exists())
        self.assertEqual(len(self.owned_files()), 1)

    def test_failed_metadata_replacement_preserves_previous_upload(self):
        self.assertEqual(self.upload().status_code, 200)
        previous = self.session.owned_video_path
        with patch('server.extract_video_metadata', side_effect=RuntimeError('private C:/server/secret/video.avi')):
            response = self.upload()
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('C:/server', response.text)
        self.assertTrue(previous.exists())
        self.assertEqual(self.session.owned_video_path, previous)
        self.assertEqual(self.owned_files(), [previous])
        self.assertFalse(self.session._uploading)

    def test_concurrent_upload_and_mutations_conflict(self):
        async def scenario():
            entered, release = asyncio.Event(), asyncio.Event()
            async def receive():
                entered.set()
                await release.wait()
                return {'type': 'http.request', 'body': self.video, 'more_body': False}
            req = Request({'type': 'http', 'headers': [], 'query_string': b'filename=match.avi'}, receive)
            first = asyncio.create_task(server.upload_session_video(self.sid, req))
            await entered.wait()
            try:
                with self.assertRaises(HTTPException) as second:
                    await server.upload_session_video(self.sid, req)
                self.assertEqual(second.exception.status_code, 409)
                with self.assertRaises(HTTPException) as deletion:
                    server.delete_tracking_session(self.sid)
                self.assertEqual(deletion.exception.status_code, 409)
                self.session.status = 'VIDEO_READY'
                with self.assertRaises(HTTPException) as calibration:
                    server.calibrate_session(self.sid, server.SessionCalibrationRequest(
                        corners=[[0, 0], [64, 0], [64, 48], [0, 48]]))
                self.assertEqual(calibration.exception.status_code, 409)
            finally:
                release.set()
                await first
        asyncio.run(scenario())
        self.assertFalse(self.session._uploading)
        self.assertEqual(len(self.owned_files()), 1)

    def test_disconnected_upload_removes_partial(self):
        calls = 0
        async def receive():
            nonlocal calls
            calls += 1
            return ({'type': 'http.request', 'body': b'partial', 'more_body': True}
                    if calls == 1 else {'type': 'http.disconnect'})
        from starlette.requests import ClientDisconnect
        req = Request({'type': 'http', 'headers': [], 'query_string': b''}, receive)
        with self.assertRaises(ClientDisconnect):
            asyncio.run(server.upload_session_video(self.sid, req))
        self.assertEqual(self.owned_files(), [])
        self.assertFalse(self.session._uploading)

    def test_worker_initialization_failure_cleans_owned_upload(self):
        self.assertEqual(self.upload().status_code, 200)
        self.session.status = 'READY_TO_ANALYZE'
        with patch('server.threading.Thread.start', side_effect=RuntimeError('C:/private/worker.py')):
            with self.assertRaises(HTTPException) as caught:
                server.start_session_analysis(self.sid)
        self.assertEqual(caught.exception.status_code, 500)
        self.assertNotIn('C:/private', caught.exception.detail)
        self.assertEqual(self.owned_files(), [])
        self.assertIsNone(self.session.owned_video_path)

    def test_decoder_initialization_failure_cleans_owned_upload(self):
        self.assertEqual(self.upload().status_code, 200)
        with patch('server.cv2.VideoCapture', side_effect=RuntimeError('C:/private/decoder')):
            server._run_session_analysis(self.session)
        self.assertEqual(self.session.status, 'ERROR')
        self.assertEqual(self.owned_files(), [])
        self.assertNotIn('C:/private', self.session.error_message)

    def test_decoder_metadata_failure_releases_capture_before_cleanup(self):
        self.assertEqual(self.upload().status_code, 200)
        real_capture = cv2.VideoCapture(self.session.video_source)
        self.addCleanup(real_capture.release)
        capture = Mock(wraps=real_capture)
        capture.get.side_effect = RuntimeError('decoder header failure')
        with patch('server.cv2.VideoCapture', return_value=capture):
            server._run_session_analysis(self.session)
        try:
            self.assertFalse(real_capture.isOpened())
            self.assertEqual(self.session.status, 'ERROR')
            self.assertEqual(self.owned_files(), [])
        finally:
            real_capture.release()

    def test_bad_upload_limit_fails_closed_without_writing(self):
        for limit in ('0', '-1', 'inf', '1.5', '9' * 5000):
            with self.subTest(limit=limit[:10]), patch.dict(os.environ, {'SPORTSCOUT_AI_MAX_UPLOAD_BYTES': limit}):
                self.assertEqual(self.upload().status_code, 503)
                self.assertEqual(self.owned_files(), [])
                self.assertFalse(self.session._uploading)

    def test_malformed_length_rejected_and_upload_reusable(self):
        for length in ('-1', 'abc', '1,2', '9' * 25):
            with self.subTest(length=length):
                self.assertEqual(self.upload(headers={'Content-Length': length}).status_code, 400)
                self.assertFalse(self.session._uploading)
        self.assertEqual(self.upload().status_code, 200)

    def test_original_filename_cannot_disclose_client_absolute_path(self):
        response = self.client.post(f'/api/tracking/sessions/{self.sid}/video',
                                    content=self.video, headers={'X-Filename': 'C:\\private\\one-hour.avi'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['videoMetadata']['filename'], 'one-hour.avi')

    def test_unowned_source_never_deleted_and_error_does_not_leak_path(self):
        self.session.video_source = str(self.source)
        with patch('server.cv2.VideoCapture', side_effect=RuntimeError(str(self.source))):
            server._run_session_analysis(self.session)
        self.assertTrue(self.source.exists())
        self.assertNotIn(str(self.root), self.session.error_message)
        server.delete_tracking_session(self.sid)
        self.assertTrue(self.source.exists())

    def test_one_hour_metadata_is_not_a_duration_rejection(self):
        metadata = {'filename': 'hour.avi', 'durationSec': 3600, 'width': 64, 'height': 48}
        with patch('server.extract_video_metadata', return_value=(metadata, {})):
            response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['videoMetadata']['durationSec'], 3600)


class RuntimeInputSecurityTests(unittest.TestCase):
    def test_shuttle_failures_do_not_disclose_model_paths(self):
        for error in (RuntimeUnavailableError, ModelUnavailableError, ShuttleInferenceError):
            with self.subTest(error=error):
                provider = Mock(spec=ShuttleTrackerProvider)
                provider.availability.return_value = ProviderAvailability(True, 'AVAILABLE', 'Ready')
                provider.infer.side_effect = error('C:/private/models/private.onnx')
                pipeline = create_shuttle_pipeline({'shuttle_enabled': True, 'shuttle_recovery_enabled': False},
                                                   custom_provider=provider)
                for index in range(3):
                    pipeline.process_frame(np.zeros((48, 64, 3), dtype=np.uint8), index / 30, index)
                self.assertNotIn('C:/private', json.dumps(pipeline.get_provenance()))

    def test_nan_in_typed_fields_is_422_not_serialization_error(self):
        client = TestClient(server.app)
        for value in (float('nan'), float('inf')):
            response = client.post('/api/tracking/sessions', content=json.dumps({
                'tracked_player_count': value}), headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('input', response.json()['detail'][0])

    def test_combined_tensor_budget_rejects_large_but_individually_valid_dimensions(self):
        with self.assertRaises(ValueError):
            ShuttlePipelineConfig(window_size=32, input_width=2048, input_height=2048)

    def test_game_type_and_player_count_rejected(self):
        client = TestClient(server.app)
        for payload in ({'game_type': 'tennis'}, {'tracked_player_count': True},
                        {'tracked_player_count': 1.5}, {'tracked_player_count': 0},
                        {'tracked_player_count': 5}):
            with self.subTest(payload=payload):
                response = client.post('/api/tracking/sessions', json=payload)
                sid = response.json().get('sessionId')
                if sid:
                    server.tracking_sessions.pop(sid)
                self.assertEqual(response.status_code, 422)

    def test_processing_numeric_fields_rejected_before_session_created(self):
        client = TestClient(server.app)
        for field in ('frameStride', 'pose_stride', 'shuttleWindowSize', 'shuttle_input_width',
                      'shuttleInputHeight', 'detectorInputSize'):
            for value in (-1, 0, 0.5, True, None, float('nan'), float('inf'), 10**9):
                with self.subTest(field=field, value=value):
                    response = client.post('/api/tracking/sessions', content=json.dumps({
                        'processing_config': {field: value}}), headers={'Content-Type': 'application/json'})
                    sid = response.json().get('sessionId')
                    if sid:
                        server.tracking_sessions.pop(sid)
                    self.assertEqual(response.status_code, 422, response.text)

    def test_invalid_confidence_and_margin_rejected(self):
        for field in ('shuttleConfidenceThreshold', 'shuttleCentroidRelativeThreshold', 'confidenceThreshold'):
            for value in (-1, 1.1, True, None, float('nan'), float('inf')):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    server.resolve_processing_config({field: value})
        for field in ('courtRoiMarginPx', 'courtRoiMarginM'):
            for value in (-1, float('nan'), float('inf'), 10**9):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    server.resolve_processing_config({field: value})

    def test_direct_and_env_shuttle_config_are_validated_without_model(self):
        for field, value in [('window_size', 10**9), ('input_width', -1), ('confidence_threshold', float('nan'))]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                ShuttlePipelineConfig(**{field: value})
        with patch.dict(os.environ, {'SHUTTLE_WINDOW_SIZE': '99999999'}), self.assertRaises(ValueError):
            ShuttlePipelineConfig.from_dict({})


if __name__ == '__main__':
    unittest.main()
