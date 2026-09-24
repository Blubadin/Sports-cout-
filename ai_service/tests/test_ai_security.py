"""SEC-0.1 boundary tests; no listening network socket is required."""

import os
import asyncio
import logging
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ai_service import server


TOKEN = "local-test-credential"


class SecurityConfigurationTests(unittest.TestCase):
    def test_default_bind_is_loopback_and_local_auth_is_optional(self):
        from ai_service.local_security import SecuritySettings

        settings = SecuritySettings.from_env({})
        self.assertEqual(settings.host, "127.0.0.1")
        self.assertFalse(settings.requires_auth)
        settings.validate_bind()

    def test_ipv4_ipv6_and_localhost_are_loopback(self):
        from ai_service.local_security import SecuritySettings

        for host in ("127.0.0.1", "localhost", "::1"):
            with self.subTest(host=host):
                SecuritySettings.from_env({"SPORTSCOUT_AI_HOST": host}).validate_bind()

    def test_remote_requires_both_opt_in_and_token(self):
        from ai_service.local_security import SecurityConfigurationError, SecuritySettings

        for env in (
            {"SPORTSCOUT_AI_HOST": "0.0.0.0", "SPORTSCOUT_AI_AUTH_TOKEN": TOKEN},
            {"SPORTSCOUT_AI_HOST": "192.0.2.10", "SPORTSCOUT_AI_REMOTE_ENABLED": "true"},
        ):
            with self.subTest(env=env), self.assertRaises(SecurityConfigurationError):
                SecuritySettings.from_env(env).validate_bind()

        settings = SecuritySettings.from_env({
            "SPORTSCOUT_AI_HOST": "0.0.0.0",
            "SPORTSCOUT_AI_REMOTE_ENABLED": "true",
            "SPORTSCOUT_AI_AUTH_TOKEN": TOKEN,
        })
        settings.validate_bind()
        self.assertTrue(settings.requires_auth)

    def test_insecure_remote_bind_fails_during_app_startup(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_HOST": "0.0.0.0", "SPORTSCOUT_AI_REMOTE_ENABLED": "false"}):
            with self.assertRaisesRegex(Exception, "Non-loopback AI host"):
                with TestClient(server.app):
                    pass


class SecurityBoundaryTests(unittest.TestCase):
    def setUp(self):
        server.tracking_sessions.clear()
        self.client = TestClient(server.app)
        self.addCleanup(server.tracking_sessions.clear)
        self.addCleanup(self.client.close)

    def test_configured_auth_rejects_missing_and_wrong_rest_credentials(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
            for headers in ({}, {"Authorization": "Bearer wrong"}):
                with self.subTest(headers=headers):
                    response = self.client.post("/api/tracking/sessions", json={"video_source": "demo"}, headers=headers)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.headers.get("www-authenticate"), "Bearer")
                    self.assertNotIn(TOKEN, response.text)

            authorized = self.client.post(
                "/api/tracking/sessions", json={"video_source": "demo"},
                headers={"Authorization": f"Bearer {TOKEN}"},
            )
            self.assertEqual(authorized.status_code, 200)

    def test_capabilities_are_protected_while_status_remains_public(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
            self.assertEqual(self.client.get("/api/status").status_code, 200)
            self.assertEqual(self.client.get("/api/capabilities").status_code, 401)

    def test_websocket_rejects_missing_and_wrong_credential_before_accept(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
            before = len(server.connected_websockets)
            for protocols in (["sportscout"], ["sportscout", "auth.wrong"]):
                with self.subTest(protocols=protocols):
                    with self.assertRaises(WebSocketDisconnect) as caught:
                        with self.client.websocket_connect("/ws/telemetry", subprotocols=protocols):
                            pass
                    self.assertEqual(caught.exception.code, 4401)
                    self.assertEqual(len(server.connected_websockets), before)

    def test_valid_websocket_uses_application_protocol_without_echoing_token(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
            with self.client.websocket_connect(
                "/ws/telemetry", subprotocols=["sportscout", f"auth.{TOKEN}"],
            ) as socket:
                self.assertEqual(socket.accepted_subprotocol, "sportscout")
                self.assertEqual(socket.receive_json()["type"], "connection_ack")

    def test_websocket_bearer_header_and_query_string_policy(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
            with self.client.websocket_connect(
                "/ws/telemetry", headers={"Authorization": f"Bearer {TOKEN}"},
            ) as socket:
                self.assertEqual(socket.receive_json()["type"], "connection_ack")
            with self.assertRaises(WebSocketDisconnect) as caught:
                with self.client.websocket_connect(f"/ws/telemetry?token={TOKEN}"):
                    pass
            self.assertEqual(caught.exception.code, 4401)

    def test_remote_interface_rejected_without_opt_in(self):
        remote_client = TestClient(server.app, base_url="http://192.0.2.10")
        with patch.dict(os.environ, {"SPORTSCOUT_AI_HOST": "127.0.0.1", "SPORTSCOUT_AI_REMOTE_ENABLED": "false"}):
            self.assertEqual(remote_client.get("/api/status").status_code, 403)
        remote_client.close()

    def test_authentication_failure_does_not_log_token(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        server.logger.addHandler(handler)
        try:
            with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": TOKEN}):
                self.assertEqual(self.client.get("/api/capabilities", headers={"Authorization": f"Bearer {TOKEN}-wrong"}).status_code, 401)
        finally:
            server.logger.removeHandler(handler)
        self.assertNotIn(TOKEN, stream.getvalue())

    def test_capability_and_session_responses_do_not_reveal_absolute_model_paths(self):
        with patch.object(server.analyzer, "model_path", "C:/private/models/yolo.pt"):
            capabilities = self.client.get("/api/capabilities")
        self.assertEqual(capabilities.status_code, 200)
        self.assertNotIn("C:/private", capabilities.text)

        created = self.client.post("/api/tracking/sessions", json={"video_source": "demo"})
        self.assertEqual(created.status_code, 200)
        sid = created.json()["sessionId"]
        session = server.tracking_sessions[sid]
        session.effective_processing_config["shuttleModelPath"] = "C:/private/models/shuttle.pth"
        session.video_source = "C:/private/matches/match.mp4"
        status = self.client.get(f"/api/tracking/sessions/{sid}/status")
        self.assertEqual(status.status_code, 200)
        self.assertNotIn("C:/private", status.text)

    def test_legacy_webcam_and_local_file_are_disabled_by_default(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as video, patch.dict(
            os.environ, {"SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES": "false"}
        ):
            for source in ("0", str(Path(video.name))):
                with self.subTest(source=source):
                    response = self.client.post("/api/start", json={"video_source": source})
                    self.assertEqual(response.status_code, 403)

    def test_legacy_network_and_unc_sources_rejected_even_when_enabled(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES": "true"}):
            for source in ("https://example.test/video.mp4", "\\\\server\\share\\video.mp4", "//server/share/video.mp4"):
                with self.subTest(source=source):
                    response = self.client.post("/api/start", json={"video_source": source})
                    self.assertEqual(response.status_code, 400)

    def test_enabled_local_source_is_not_echoed_in_response(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as video, patch.dict(
            os.environ, {"SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES": "true"}
        ), patch.object(server.threading.Thread, "start"):
            server.is_tracking = False
            try:
                response = asyncio.run(server.start_tracking(server.StartStreamRequest(video_source=video.name)))
                self.assertEqual(response["status"], "started")
                self.assertNotIn(video.name, str(response))
            finally:
                server.is_tracking = False
                server.tracking_mode = "idle"

    def test_loopback_without_token_keeps_session_creation_available(self):
        with patch.dict(os.environ, {"SPORTSCOUT_AI_AUTH_TOKEN": ""}):
            response = self.client.post("/api/tracking/sessions", json={"video_source": "demo"})
            self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
