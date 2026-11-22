"""Thai report localisation for the analysis export (PDF, heatmaps, README)."""

from __future__ import annotations

import json
from pathlib import Path
import re
import string
import sys

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_AI_SERVICE = Path(__file__).resolve().parent.parent
for _p in (_REPO_ROOT, _AI_SERVICE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import tempfile
import unittest
from unittest.mock import patch
import zipfile

from analysis_exporter import AnalysisExporter, ExportOptions
from analysis_job_store import AnalysisJobStore
import analysis_exporter

# Use the exact module object the exporter imported (package vs. flat import), so patches take effect.
report_i18n = sys.modules[analysis_exporter.report_font_context.__module__]
STRINGS = report_i18n.STRINGS
Translator = report_i18n.Translator
normalize_language = report_i18n.normalize_language
report_font_context = report_i18n.report_font_context
thai_font_family = report_i18n.thai_font_family
from test_analysis_exporter import create_test_video, sample_telemetry_chunk

THAI_RE = re.compile(r"[฀-๿]")


def _placeholders(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


class ReportStringTests(unittest.TestCase):
    def test_every_key_has_thai_text(self):
        for key, entry in STRINGS.items():
            with self.subTest(key=key):
                self.assertTrue(entry["th"].strip(), "missing Thai text")

    def test_placeholders_match_between_languages(self):
        for key, entry in STRINGS.items():
            if not entry["en"]:
                continue  # README is Thai-only; English README is the original template
            with self.subTest(key=key):
                self.assertEqual(_placeholders(entry["en"]), _placeholders(entry["th"]))

    def test_thai_strings_contain_thai_script(self):
        for key, entry in STRINGS.items():
            with self.subTest(key=key):
                self.assertRegex(entry["th"], THAI_RE)

    def test_translator_formats_and_falls_back(self):
        self.assertEqual(Translator("th")("player_n", n=2), "ผู้เล่น 2")
        self.assertEqual(Translator("en")("player_n", n=2), "Player 2")
        self.assertEqual(Translator("fr")("player_n", n=2), "Player 2")

    def test_normalize_language(self):
        self.assertEqual(normalize_language("TH"), "th")
        self.assertEqual(normalize_language(None), "en")
        self.assertEqual(normalize_language("de"), "en")

    def test_thai_date_uses_buddhist_year(self):
        import datetime
        text = report_i18n.format_report_date(datetime.datetime(2026, 11, 12, 14, 30), "th")
        self.assertIn("พฤศจิกายน 2569", text)
        self.assertIn("14:30", text)


class ExportOptionsLanguageTests(unittest.TestCase):
    def test_default_is_english(self):
        self.assertEqual(ExportOptions.preset_analysis().language, "en")

    def test_language_is_normalised(self):
        self.assertEqual(ExportOptions(language="TH").language, "th")
        self.assertEqual(ExportOptions(language="xx").language, "en")

    def test_request_model_accepts_language(self):
        from ai_service.server import ExportSessionRequest
        self.assertEqual(ExportSessionRequest.model_validate({"language": "th"}).language, "th")
        self.assertIsNone(ExportSessionRequest.model_validate({}).language)


class ThaiFontTests(unittest.TestCase):
    def test_resolved_font_really_has_thai_glyphs(self):
        family = thai_font_family()
        if family is None:
            self.skipTest("no Thai-capable font installed on this machine")
        found = report_i18n.find_thai_font_files()
        self.assertTrue(report_i18n._has_thai_glyphs(found[0]))

    def test_missing_font_falls_back_to_english(self):
        with patch.object(report_i18n, "thai_font_family", return_value=None):
            with report_font_context("th") as effective:
                self.assertEqual(effective, "en")

    def test_english_never_needs_font(self):
        with report_font_context("en") as effective:
            self.assertEqual(effective, "en")


class ThaiExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.output_dir = base / "exports"
        video = base / "source.mp4"
        create_test_video(video, frame_count=15)
        self.store = AnalysisJobStore(base / "store", page_limit=10)
        self.session_id = "sess_thai_report"
        self.store.create_job(
            self.session_id,
            {"mediaHash": "h", "configHash": "c"},
            metadata={"session": {
                "videoSource": str(video), "gameType": "doubles", "projectId": "p",
                "videoMetadata": {"width": 320, "height": 240, "fps": 30.0, "totalFrames": 15, "filename": "match.mp4"},
                "processingConfig": {"shuttleEnabled": True, "poseStride": 1},
            }},
        )
        self.store.update_job(self.session_id, {"status": "COMPLETED"})
        telemetry = sample_telemetry_chunk(15)
        self.store.append_result_chunk(self.session_id, 1, telemetry[:10])
        self.store.append_result_chunk(self.session_id, 2, telemetry[10:])
        self.exporter = AnalysisExporter(self.store)

    def tearDown(self):
        self.tmp.cleanup()

    def _export(self, language: str, name: str) -> zipfile.ZipFile:
        out = self.output_dir / name
        self.exporter.export(self.session_id, options=ExportOptions(language=language), target_zip_path=out)
        return zipfile.ZipFile(out, "r")

    def test_thai_export_produces_thai_readme_pdf_and_manifest(self):
        if thai_font_family() is None:
            self.skipTest("no Thai-capable font installed on this machine")
        with self._export("th", "th.zip") as zf:
            readme = zf.read("README.txt").decode("utf-8")
            self.assertRegex(readme, THAI_RE)
            manifest = json.loads(zf.read("data/export_manifest.json"))
            self.assertEqual(manifest["reportLanguageRequested"], "th")
            self.assertEqual(manifest["reportLanguageEffective"], "th")
            pdf = zf.read("report/SportsScout_Report.pdf")
            self.assertTrue(pdf.startswith(b"%PDF-"))
            self.assertTrue(zf.read("heatmaps/player_movement_heatmap.png").startswith(b"\x89PNG"))

    def test_thai_request_without_font_is_reported_not_hidden(self):
        with patch.object(report_i18n, "thai_font_family", return_value=None):
            with self._export("th", "nofont.zip") as zf:
                manifest = json.loads(zf.read("data/export_manifest.json"))
                self.assertEqual(manifest["reportLanguageRequested"], "th")
                self.assertEqual(manifest["reportLanguageEffective"], "en")
                self.assertTrue(any("Thai-capable font" in w for w in manifest["warnings"]))
                self.assertNotRegex(zf.read("README.txt").decode("utf-8"), THAI_RE)

    def test_english_export_unchanged(self):
        with self._export("en", "en.zip") as zf:
            readme = zf.read("README.txt").decode("utf-8")
            self.assertIn("SportsScout Match Analysis Export Package", readme)
            self.assertNotRegex(readme, THAI_RE)
            manifest = json.loads(zf.read("data/export_manifest.json"))
            self.assertEqual(manifest["reportLanguageEffective"], "en")

    def test_thai_pdf_pages_render_without_error_for_all_builders(self):
        if thai_font_family() is None:
            self.skipTest("no Thai-capable font installed on this machine")
        import matplotlib.pyplot as plt
        frames = sample_telemetry_chunk(15)
        job = self.store.get_job(self.session_id)
        with report_font_context("th") as effective:
            tr = Translator(effective)
            figures = [
                self.exporter._build_pdf_page_summary(job, frames, ExportOptions(language="th"), tr),
                self.exporter._build_pdf_page_players(job, frames, [], tr),
                self.exporter._build_pdf_page_diagnostics(job, frames, ExportOptions(language="th"), tr),
                self.exporter._build_pdf_page_ground_quality(frames, tr),
            ]
            for fig in figures:
                plt.close(fig)


if __name__ == "__main__":
    unittest.main()
