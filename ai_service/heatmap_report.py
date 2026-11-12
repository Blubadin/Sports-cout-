"""Analyst-oriented court heatmaps for the analysis export.

Every heatmap is a zone grid on a light court: each cell shows the percentage
of observations that fall in it, so the picture can be read off directly
(no guessing colours). The same zone numbers are written to
``heatmap_zones.json`` so analysts can reuse them in their own tools.

Coordinates are court metres: x 0..6.1 (doubles width), y 0..13.4 (length),
net at y = 6.7. Observations outside the court are excluded from the
percentages and reported separately.
"""

from __future__ import annotations

import datetime
from pathlib import Path
import textwrap
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from matplotlib.cm import ScalarMappable
from matplotlib.patches import Rectangle
import numpy as np

try:
    from ai_service.report_i18n import Translator
except ImportError:
    from report_i18n import Translator


COURT_W = 6.1
COURT_L = 13.4
NET_Y = 6.7
COL_EDGES = [0.0, 2.0333, 4.0667, 6.1]                      # 3 columns across the court
ROW_EDGES = [0.0, 2.2333, 4.4667, 6.7, 8.9333, 11.1667, 13.4]  # 6 rows; the net is a boundary
N_COLS = len(COL_EDGES) - 1
N_ROWS = len(ROW_EDGES) - 1
MIN_POINTS = 5
CMAP = plt.get_cmap("YlOrRd")
COURT_FILL = "#eaf4ec"
LINE_COLOR = "#1f2937"


def split_in_court(points: Iterable[Tuple[float, float]]) -> Tuple[List[Tuple[float, float]], int]:
    inside: List[Tuple[float, float]] = []
    outside = 0
    for x, y in points:
        if not (np.isfinite(x) and np.isfinite(y)):
            continue
        if 0.0 <= x <= COURT_W and 0.0 <= y <= COURT_L:
            inside.append((float(x), float(y)))
        else:
            outside += 1
    return inside, outside


def zone_counts(inside: Sequence[Tuple[float, float]]) -> np.ndarray:
    """Counts per zone, shape (N_ROWS, N_COLS). Row 0 is the bottom edge (y = 0)."""
    counts = np.zeros((N_ROWS, N_COLS), dtype=float)
    for x, y in inside:
        c = min(max(int(np.searchsorted(COL_EDGES, x, side="right")) - 1, 0), N_COLS - 1)
        r = min(max(int(np.searchsorted(ROW_EDGES, y, side="right")) - 1, 0), N_ROWS - 1)
        counts[r, c] += 1
    return counts


def zone_percent(counts: np.ndarray) -> np.ndarray:
    total = counts.sum()
    return counts / total * 100.0 if total > 0 else np.zeros_like(counts)


def summarise(counts: np.ndarray, outside: int) -> Dict[str, Any]:
    pct = zone_percent(counts)
    total = int(counts.sum())
    result: Dict[str, Any] = {
        "validFrames": total,
        "outsideCourtFrames": int(outside),
        "zonePercent": [[round(float(v), 2) for v in row] for row in pct],
        "zoneCounts": [[int(v) for v in row] for row in counts],
        "halfPercent": {
            "y0To6_7m": round(float(pct[:3].sum()), 2),
            "y6_7To13_4m": round(float(pct[3:].sum()), 2),
        },
    }
    if total > 0:
        r, c = np.unravel_index(int(np.argmax(pct)), pct.shape)
        result["mostTimeZone"] = {
            "xRangeM": [COL_EDGES[c], COL_EDGES[c + 1]],
            "yRangeM": [ROW_EDGES[r], ROW_EDGES[r + 1]],
            "percent": round(float(pct[r, c]), 2),
        }
    return result


def _draw_court(ax) -> None:
    ax.add_patch(Rectangle((0, 0), COURT_W, COURT_L, facecolor=COURT_FILL, edgecolor="none", zorder=0))
    lw = 1.6
    kw = dict(color=LINE_COLOR, lw=lw, zorder=3, solid_capstyle="butt")
    ax.plot([0, COURT_W, COURT_W, 0, 0], [0, 0, COURT_L, COURT_L, 0], **kw)     # outer boundary
    ax.plot([0, COURT_W], [NET_Y, NET_Y], color=LINE_COLOR, lw=2.2, ls="--", zorder=3)  # net
    for y in (NET_Y - 1.98, NET_Y + 1.98):                                       # short service lines
        ax.plot([0, COURT_W], [y, y], **kw)
    for x in (0.46, COURT_W - 0.46):                                             # singles sidelines
        ax.plot([x, x], [0, COURT_L], **kw)
    ax.plot([3.05, 3.05], [0, NET_Y - 1.98], **kw)                               # centre line
    ax.plot([3.05, 3.05], [NET_Y + 1.98, COURT_L], **kw)
    for y in (0.76, COURT_L - 0.76):                                             # doubles long service
        ax.plot([0, COURT_W], [y, y], color=LINE_COLOR, lw=1.0, ls=":", zorder=3)


def _draw_zones(ax, pct: np.ndarray, vmax: float) -> None:
    norm = Normalize(0, vmax if vmax > 0 else 1)
    for r in range(N_ROWS):
        for c in range(N_COLS):
            v = float(pct[r, c])
            x0, x1 = COL_EDGES[c], COL_EDGES[c + 1]
            y0, y1 = ROW_EDGES[r], ROW_EDGES[r + 1]
            if v > 0:
                ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, facecolor=CMAP(norm(v)),
                                       edgecolor="none", zorder=1))
            ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, facecolor="none",
                                   edgecolor="#ffffff", lw=1.4, zorder=2))
            dark_on_light = not (v > 0 and v >= 0.55 * norm.vmax)
            ax.text((x0 + x1) / 2, (y0 + y1) / 2, f"{v:.1f}%" if v > 0 else "0%",
                    ha="center", va="center", fontsize=10, fontweight="bold",
                    color="#111827" if dark_on_light else "#ffffff", zorder=4)


def _style_axes(ax, tr: Translator, show_labels: bool = True) -> None:
    ax.set_xlim(-0.5, COURT_W + 0.5)
    ax.set_ylim(-0.5, COURT_L + 0.5)
    ax.set_aspect("equal")
    ax.set_xticks(COL_EDGES)
    ax.set_yticks(ROW_EDGES)
    ax.set_xticklabels([f"{v:.1f}" for v in COL_EDGES], fontsize=8, color="#374151")
    ax.set_yticklabels([f"{v:.1f}" for v in ROW_EDGES], fontsize=8, color="#374151")
    if show_labels:
        ax.set_xlabel(tr("hm_xlabel"), fontsize=9, color="#374151")
        ax.set_ylabel(tr("hm_ylabel"), fontsize=9, color="#374151")
    for spine in ax.spines.values():
        spine.set_color("#9ca3af")
    ax.set_facecolor("#ffffff")


def _stats_lines(summary: Dict[str, Any], tr: Translator) -> List[str]:
    total_frames = summary["validFrames"] + summary["outsideCourtFrames"]
    pct_basis = (summary["validFrames"] / total_frames * 100.0) if total_frames else 0.0
    lines = [tr("hm_stat_basis", n=summary["validFrames"], p=pct_basis)]
    top = summary.get("mostTimeZone")
    if top:
        lines.append(tr("hm_stat_top", zone=f"x {top['xRangeM'][0]:.1f}–{top['xRangeM'][1]:.1f} m · "
                                            f"y {top['yRangeM'][0]:.1f}–{top['yRangeM'][1]:.1f} m",
                        p=top["percent"]))
    halves = summary["halfPercent"]
    lines.append(tr("hm_stat_halves", a=halves["y0To6_7m"], b=halves["y6_7To13_4m"]))
    if summary["outsideCourtFrames"]:
        lines.append(tr("hm_stat_outside", n=summary["outsideCourtFrames"]))
    return lines


def render_zone_heatmap(
    points: Sequence[Tuple[float, float]],
    title: str,
    output_path: Path,
    tr: Translator,
    *,
    caption_key: str = "hm_cap_player",
    legend_key: str = "hm_legend_pct",
    dots: bool = False,
    vmax: Optional[float] = None,
) -> Dict[str, Any]:
    """Render one zone heatmap PNG and return its zone summary."""
    inside, outside = split_in_court(points)
    sufficient = len(inside) >= MIN_POINTS
    counts = zone_counts(inside) if sufficient else np.zeros((N_ROWS, N_COLS))
    summary = summarise(counts, outside)
    # Keep the count of valid observations even when the display suppresses
    # zone percentages for an insufficient sample.
    summary["validFrames"] = len(inside)
    summary["sufficientData"] = sufficient
    pct = zone_percent(counts)
    shared_vmax = vmax if vmax is not None else max(float(pct.max()), 1.0)

    fig = plt.figure(figsize=(6.6, 9.4), facecolor="#ffffff")
    fig.text(0.5, 0.965, title, ha="center", va="top", fontsize=13, fontweight="bold", color="#111827")
    ax = fig.add_axes([0.13, 0.25, 0.64, 0.66])
    _draw_court(ax)
    if sufficient:
        _draw_zones(ax, pct, shared_vmax)
        if dots:
            xs, ys = zip(*inside)
            ax.scatter(xs, ys, s=20, c="#dc2626", edgecolors="#ffffff", linewidths=0.6, zorder=5)
    else:
        ax.text(COURT_W / 2, COURT_L / 2, tr("hm_insufficient"), ha="center", va="center",
                fontsize=10, fontweight="bold", color="#b91c1c", zorder=6,
                bbox=dict(boxstyle="round,pad=0.6", facecolor="#fef2f2", edgecolor="#fca5a5"))
    _style_axes(ax, tr)

    cax = fig.add_axes([0.82, 0.25, 0.035, 0.66])
    sm = ScalarMappable(norm=Normalize(0, shared_vmax), cmap=CMAP)
    cbar = fig.colorbar(sm, cax=cax)
    cbar.set_label(tr(legend_key), fontsize=9)
    cbar.ax.tick_params(labelsize=8)

    caption = textwrap.fill(tr(caption_key), width=88)
    fig.text(0.5, 0.165, caption, ha="center", va="top", fontsize=8.5, color="#374151", linespacing=1.4)
    stats = _stats_lines(summary, tr) if sufficient else [tr("hm_stat_outside", n=outside)] if outside else []
    fig.text(0.5, 0.075, "\n".join(stats), ha="center", va="top", fontsize=8.5, color="#111827", linespacing=1.5)

    fig.savefig(output_path, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    return summary


def render_comparison(
    player_points: Dict[str, Sequence[Tuple[float, float]]],
    output_path: Path,
    tr: Translator,
) -> Dict[str, Dict[str, Any]]:
    """Four courts side by side on one shared colour scale, so players are directly comparable."""
    per_player: Dict[str, Dict[str, Any]] = {}
    pcts: Dict[str, np.ndarray] = {}
    for pid, pts in player_points.items():
        inside, outside = split_in_court(pts)
        sufficient = len(inside) >= MIN_POINTS
        counts = zone_counts(inside) if sufficient else np.zeros((N_ROWS, N_COLS))
        per_player[pid] = summarise(counts, outside)
        per_player[pid]["sufficientData"] = sufficient
        pcts[pid] = zone_percent(counts)
    vmax = max([float(p.max()) for p in pcts.values()] + [1.0])

    fig, axes = plt.subplots(1, len(player_points), figsize=(13.2, 8.2), facecolor="#ffffff")
    fig.subplots_adjust(left=0.05, right=0.9, top=0.8, bottom=0.2, wspace=0.18)
    fig.text(0.5, 0.95, tr("hm_compare_title"), ha="center", va="top", fontsize=14, fontweight="bold", color="#111827")
    fig.text(0.5, 0.885, tr("hm_compare_sub"), ha="center", va="top", fontsize=9.5, color="#374151")
    for idx, (pid, ax) in enumerate(zip(player_points.keys(), axes)):
        _draw_court(ax)
        summary = per_player[pid]
        if summary["sufficientData"]:
            _draw_zones(ax, pcts[pid], vmax)
        else:
            ax.text(COURT_W / 2, COURT_L / 2, tr("hm_insufficient"), ha="center", va="center",
                    fontsize=8.5, fontweight="bold", color="#b91c1c", zorder=6,
                    bbox=dict(boxstyle="round,pad=0.4", facecolor="#fef2f2", edgecolor="#fca5a5"))
        _style_axes(ax, tr, show_labels=idx == 0)
        n = int(pid[-1]) if pid[-1].isdigit() else idx + 1
        ax.set_title(tr("hm_player_short", n=n), fontsize=11, fontweight="bold", color="#111827", pad=8)
        ax.text(0.5, -0.13, tr("hm_stat_basis_short", n=summary["validFrames"]), transform=ax.transAxes,
                ha="center", va="top", fontsize=8.5, color="#374151")

    cax = fig.add_axes([0.92, 0.25, 0.012, 0.55])
    cbar = fig.colorbar(ScalarMappable(norm=Normalize(0, vmax), cmap=CMAP), cax=cax)
    cbar.set_label(tr("hm_legend_pct"), fontsize=9)
    cbar.ax.tick_params(labelsize=8)
    fig.text(0.5, 0.06, textwrap.fill(tr("hm_cap_player"), width=130), ha="center", va="top",
             fontsize=8.5, color="#374151")
    fig.savefig(output_path, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    return per_player


def build_zones_payload(
    players: Dict[str, Dict[str, Any]],
    shuttle_landings: Optional[Dict[str, Any]],
    shuttle_positions: Optional[Dict[str, Any]],
    language: str,
) -> Dict[str, Any]:
    return {
        "generatedAt": datetime.datetime.now().isoformat(),
        "language": language,
        "unit": "percent of observations per zone (valid frames only)",
        "courtMetres": {"width": COURT_W, "length": COURT_L, "netY": NET_Y},
        "colEdgesM": COL_EDGES,
        "rowEdgesM": ROW_EDGES,
        "rowOrder": "row 0 = y 0 (bottom edge of the export image)",
        "players": players,
        "shuttleLandings": shuttle_landings,
        "shuttlePositions": shuttle_positions,
        "notes": [
            "Only calibrated, court-play observations are counted.",
            "Observations outside the court are excluded from percentages and reported as outsideCourtFrames.",
            "Zone percentages are descriptive 2D image-derived estimates, not validated physical distances.",
        ],
    }
