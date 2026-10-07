import unittest

from ai_service.server import ExportSessionRequest
from ai_service.analysis_exporter import ExportProgressState


class ExportRequestTests(unittest.TestCase):
    def test_browser_overlay_choices_are_accepted(self):
        request = ExportSessionRequest.model_validate({
            "preset": "CUSTOM",
            "playerDetection": False,
            "groundPoints": False,
            "playerLabels": False,
            "trackIds": True,
            "debugInfo": True,
        })
        self.assertIs(request.playerDetection, False)
        self.assertIs(request.groundPoints, False)
        self.assertIs(request.playerLabels, False)
        self.assertIs(request.trackIds, True)
        self.assertIs(request.debugInfo, True)

    def test_existing_snake_case_aliases_still_work(self):
        request = ExportSessionRequest.model_validate({"player_detection": False})
        self.assertIs(request.playerDetection, False)

    def test_progress_stage_matches_frontend_contract(self):
        progress = ExportProgressState("exp_test", "session_test")
        progress.update("generating_pdf", "Generating PDF", 75)
        self.assertEqual(progress.snapshot()["stage"], "GENERATING_REPORT")


if __name__ == "__main__":
    unittest.main()
