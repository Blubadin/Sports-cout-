"""Zone-grid heatmaps: zone maths, insufficient-data handling and output files."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_AI_SERVICE = Path(__file__).resolve().parent.parent
for _p in (_REPO_ROOT, _AI_SERVICE):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import numpy as np

import heatmap_report as hr
from report_i18n import Translator


class ZoneMathTests(unittest.TestCase):
    def test_points_land_in_expected_zone(self):
        # bottom-left zone: x in [0, 2.03), y in [0, 2.23)
        counts = hr.zone_counts([(0.5, 0.5)])
        self.assertEqual(counts[0, 0], 1)
        # top-right zone: x in [4.07, 6.1], y in [11.17, 13.4]
        counts = hr.zone_counts([(6.0, 13.0)])
        self.assertEqual(counts[hr.N_ROWS - 1, hr.N_COLS - 1], 1)

    def test_boundary_values_stay_inside_the_grid(self):
        counts = hr.zone_counts([(0.0, 0.0), (6.1, 13.4), (6.1, 0.0), (0.0, 13.4)])
        self.assertEqual(counts.sum(), 4)

    def test_percentages_sum_to_100_and_halves_match(self):
        pts = [(1.0, 1.0)] * 3 + [(1.0, 12.0)]
        inside, outside = hr.split_in_court(pts)
        summary = hr.summarise(hr.zone_counts(inside), outside)
        pct = np.array(summary["zonePercent"])
        self.assertAlmostEqual(pct.sum(), 100.0, places=6)
        self.assertAlmostEqual(summary["halfPercent"]["y0To6_7m"], 75.0)
        self.assertAlmostEqual(summary["halfPercent"]["y6_7To13_4m"], 25.0)

    def test_outside_court_points_are_excluded_and_reported(self):
        inside, outside = hr.split_in_court([(1.0, 1.0), (-0.5, 3.0), (3.0, 14.2), (float("nan"), 2.0)])
        self.assertEqual(len(inside), 1)
        self.assertEqual(outside, 2)  # NaN is dropped entirely, not counted as outside

    def test_most_time_zone_is_reported(self):
        pts = [(5.0, 1.0)] * 4 + [(1.0, 1.0)]
        inside, outside = hr.split_in_court(pts)
        summary = hr.summarise(hr.zone_counts(inside), outside)
        self.assertEqual(summary["mostTimeZone"]["xRangeM"], [hr.COL_EDGES[2], hr.COL_EDGES[3]])
        self.assertAlmostEqual(summary["mostTimeZone"]["percent"], 80.0)

    def test_empty_input_has_no_most_time_zone(self):
        summary = hr.summarise(hr.zone_counts([]), 0)
        self.assertNotIn("mostTimeZone", summary)
        self.assertEqual(summary["validFrames"], 0)


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.tr = Translator("en")
        self.points = [(1.0 + 0.01 * i, 2.0 + 0.02 * i) for i in range(40)]

    def tearDown(self):
        self.tmp.cleanup()

    def test_zone_heatmap_writes_png_and_summary(self):
        out = self.dir / "p.png"
        summary = hr.render_zone_heatmap(self.points, "Player", out, self.tr)
        self.assertTrue(out.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertTrue(summary["sufficientData"])
        self.assertEqual(summary["validFrames"], 40)

    def test_too_few_points_is_marked_insufficient_not_blank_zones(self):
        out = self.dir / "few.png"
        points = [(1.0, 1.0), (1.2, 1.1), (1.4, 1.2), (1.6, 1.3)]
        summary = hr.render_zone_heatmap(points, "Shuttle", out, self.tr)
        self.assertFalse(summary["sufficientData"])
        self.assertEqual(summary["validFrames"], len(points))
        self.assertEqual(sum(sum(row) for row in summary["zoneCounts"]), 0)
        self.assertTrue(out.exists())

    def test_landings_mode_draws_dots_and_still_writes_png(self):
        out = self.dir / "landings.png"
        summary = hr.render_zone_heatmap(self.points, "Landings", out, self.tr,
                                         caption_key="hm_cap_landing", legend_key="hm_legend_landing", dots=True)
        self.assertTrue(summary["sufficientData"])
        self.assertTrue(out.read_bytes().startswith(b"\x89PNG"))

    def test_comparison_uses_one_figure_for_all_players(self):
        out = self.dir / "compare.png"
        players = {"P1": self.points, "P2": [], "P3": self.points[:10], "P4": self.points}
        result = hr.render_comparison(players, out, self.tr)
        self.assertEqual(set(result), {"P1", "P2", "P3", "P4"})
        self.assertFalse(result["P2"]["sufficientData"])
        self.assertTrue(result["P4"]["sufficientData"])
        self.assertTrue(out.read_bytes().startswith(b"\x89PNG"))

    def test_zones_payload_is_valid_json_with_all_sections(self):
        payload = hr.build_zones_payload({"P1": {"validFrames": 1}}, None, None, "th")
        text = json.dumps(payload, ensure_ascii=False)
        data = json.loads(text)
        self.assertEqual(data["language"], "th")
        self.assertEqual(data["colEdgesM"], hr.COL_EDGES)
        self.assertEqual(data["rowEdgesM"], hr.ROW_EDGES)
        self.assertIn("players", data)
        self.assertIn("notes", data)


if __name__ == "__main__":
    unittest.main()
