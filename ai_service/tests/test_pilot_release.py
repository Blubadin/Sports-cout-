import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from ai_service import server
from ai_service.local_security import SecuritySettings, SecurityConfigurationError


class PilotReleaseTests(unittest.TestCase):
    def test_every_export_route_is_blocked_before_loading_any_artifact(self):
        with patch.dict(os.environ, {'SPORTSCOUT_RELEASE_CHANNEL': 'pilot', 'SPORTSCOUT_AI_AUTH_TOKEN': 'pilot-route-test'}), TestClient(server.app, raise_server_exceptions=False) as client:
            for method, path in [
                ('POST', '/api/tracking/sessions/existing/export'),
                ('GET', '/api/tracking/exports/existing/status'),
                ('POST', '/api/tracking/exports/existing/cancel'),
                ('GET', '/api/tracking/exports/existing/download'),
                ('GET', '/api/tracking/exports/existing/download/'),
            ]:
                with self.subTest(path=path):
                    response = client.request(method, path)
                    self.assertEqual(response.status_code, 403)
                    self.assertEqual(response.json()['code'], 'EXPORT_DISABLED_IN_PILOT')

    def test_development_export_behavior_is_preserved(self):
        with patch.dict(os.environ, {'SPORTSCOUT_RELEASE_CHANNEL': 'development', 'SPORTSCOUT_AI_AUTH_TOKEN': ''}):
            with TestClient(server.app) as client:
                self.assertEqual(client.get('/api/tracking/exports/nonexistent/download').status_code, 404)

    def test_pilot_cannot_start_with_unauthenticated_local_api(self):
        with self.assertRaises(SecurityConfigurationError):
            SecuritySettings.from_env({'SPORTSCOUT_RELEASE_CHANNEL': 'pilot'}).validate_bind()
        SecuritySettings.from_env({'SPORTSCOUT_RELEASE_CHANNEL': 'pilot', 'SPORTSCOUT_AI_AUTH_TOKEN': 'device-only-test'}).validate_bind()
