import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent))
from server import configure_server_event_loop


class ServerEventLoopTests(unittest.TestCase):
    def test_windows_uses_selector_policy_without_uvicorn_override(self):
        with patch('sys.platform', 'win32'), patch.object(
            asyncio, 'WindowsSelectorEventLoopPolicy', create=True,
        ) as policy, patch.object(asyncio, 'set_event_loop_policy') as install:
            self.assertEqual(configure_server_event_loop(), 'none')
            install.assert_called_once_with(policy.return_value)

    def test_other_platforms_keep_uvicorn_auto_loop(self):
        with patch('sys.platform', 'linux'), patch.object(asyncio, 'set_event_loop_policy') as install:
            self.assertEqual(configure_server_event_loop(), 'auto')
            install.assert_not_called()
