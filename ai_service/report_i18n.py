"""Report localisation (English / Thai) and Thai font resolution for exports.

The PDF report and heatmap PNGs are drawn with matplotlib. Its default font has
no Thai glyphs, so Thai text would render as empty boxes. ``report_font_context``
finds a Thai-capable font that is already installed (or supplied through
``SPORTSCOUT_THAI_FONT``) and applies it for the duration of an export.
No font file is bundled with the repository.
"""

from __future__ import annotations

from contextlib import contextmanager
import datetime
import logging
import os
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

import matplotlib
from matplotlib import font_manager, ft2font

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = ("en", "th")

THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]

# (regular file, bold file) candidates, tried in order.
_FONT_CANDIDATES: List[Tuple[str, Optional[str]]] = [
    ("tahoma.ttf", "tahomabd.ttf"),
    ("LeelawUI.ttf", "leelawdb.ttf"),
    ("leelawad.ttf", "leelawdb.ttf"),
    ("NotoSansThai-Regular.ttf", "NotoSansThai-Bold.ttf"),
    ("Sarabun-Regular.ttf", "Sarabun-Bold.ttf"),
    ("THSarabunNew.ttf", "THSarabunNew Bold.ttf"),
    ("Garuda.ttf", "Garuda-Bold.ttf"),
    ("Loma.ttf", "Loma-Bold.ttf"),
    ("Thonburi.ttc", None),
]


def normalize_language(value: object) -> str:
    text = str(value or "en").strip().lower()
    return text if text in SUPPORTED_LANGUAGES else "en"


def _font_dirs() -> List[Path]:
    dirs: List[Path] = []
    windir = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windir:
        dirs.append(Path(windir) / "Fonts")
    dirs += [
        Path("/usr/share/fonts"), Path("/usr/local/share/fonts"),
        Path.home() / ".fonts", Path.home() / ".local/share/fonts",
        Path("/System/Library/Fonts"), Path("/Library/Fonts"),
    ]
    return [d for d in dirs if d.is_dir()]


def find_thai_font_files() -> Optional[Tuple[Path, Optional[Path]]]:
    """Return (regular, bold-or-None) font files that contain Thai glyphs."""
    override = os.environ.get("SPORTSCOUT_THAI_FONT")
    if override:
        regular = Path(override)
        if regular.is_file() and _has_thai_glyphs(regular):
            return regular, None
        logger.warning("SPORTSCOUT_THAI_FONT does not point to a file: %s", override)

    dirs = _font_dirs()

    def locate(directory: Path, name: str) -> Optional[Path]:
        direct = directory / name
        if direct.is_file():
            return direct
        return next(iter(directory.rglob(name)), None)  # system font trees are shallow

    for regular_name, bold_name in _FONT_CANDIDATES:
        for directory in dirs:
            regular = locate(directory, regular_name)
            if regular is None or not _has_thai_glyphs(regular):
                continue
            bold = locate(directory, bold_name) if bold_name else None
            return regular, bold
    return None


def _has_thai_glyphs(font_file: Path) -> bool:
    try:
        return ft2font.FT2Font(str(font_file)).get_char_index(0x0E01) > 0  # ก
    except Exception:
        return False


def thai_font_family() -> Optional[str]:
    """Register a Thai font with matplotlib and return its family name."""
    found = find_thai_font_files()
    if found is None:
        return None
    regular, bold = found
    try:
        font_manager.fontManager.addfont(str(regular))
        if bold is not None:
            font_manager.fontManager.addfont(str(bold))
        return font_manager.FontProperties(fname=str(regular)).get_name()
    except Exception as error:  # pragma: no cover - depends on host fonts
        logger.warning("Could not register Thai font %s: %s", regular, error)
        return None


@contextmanager
def report_font_context(language: str) -> Iterator[str]:
    """Yield the effective language ('th' only if a Thai font is usable)."""
    language = normalize_language(language)
    if language != "th":
        yield "en"
        return
    family = thai_font_family()
    if family is None:
        logger.warning("No Thai-capable font found; falling back to English report.")
        yield "en"
        return
    with matplotlib.rc_context({"font.family": [family, "DejaVu Sans"], "axes.unicode_minus": False}):
        yield "th"


def format_report_date(moment: datetime.datetime, language: str) -> str:
    if language == "th":
        return f"{moment.day} {THAI_MONTHS[moment.month - 1]} {moment.year + 543} เวลา {moment:%H:%M} น."
    return moment.strftime("%B %d, %Y - %H:%M")


# key -> {"en": ..., "th": ...}; values may contain str.format placeholders.
STRINGS: Dict[str, Dict[str, str]] = {
    # --- shared ---
    "unknown": {"en": "unknown", "th": "ไม่ทราบ"},
    "na": {"en": "N/A", "th": "ไม่มีข้อมูล"},
    "enabled": {"en": "ENABLED", "th": "เปิด"},
    "disabled": {"en": "DISABLED", "th": "ปิด"},
    "frames_unit": {"en": "{n} frames", "th": "{n} เฟรม"},
    # --- page 1 ---
    "title": {"en": "SPORTSCOUT MATCH ANALYSIS REPORT", "th": "รายงานวิเคราะห์การแข่งขัน SportsScout"},
    "generated": {"en": "Generated: {date} | SportsScout Tactical Workstation", "th": "สร้างเมื่อ: {date} | SportsScout Tactical Workstation"},
    "sec1": {"en": "1. MATCH & ANALYSIS INFORMATION", "th": "1. ข้อมูลการแข่งขันและการวิเคราะห์"},
    "default_match_name": {"en": "Badminton Match Analysis", "th": "การวิเคราะห์การแข่งขันแบดมินตัน"},
    "lbl_match": {"en": "Match / File Name:", "th": "ชื่อการแข่งขัน / ไฟล์:"},
    "lbl_sport": {"en": "Sport / Game Type:", "th": "กีฬา / ประเภทเกม:"},
    "sport_value": {"en": "Badminton ({game_type})", "th": "แบดมินตัน ({game_type})"},
    "game_singles": {"en": "Singles", "th": "เดี่ยว"},
    "game_doubles": {"en": "Doubles", "th": "คู่"},
    "lbl_duration": {"en": "Duration:", "th": "ความยาววิดีโอ:"},
    "duration_value": {"en": "{d} s ({n} analyzed frames)", "th": "{d} วินาที (วิเคราะห์ {n} เฟรม)"},
    "lbl_resolution": {"en": "Source Resolution:", "th": "ความละเอียดต้นฉบับ:"},
    "lbl_session": {"en": "Analysis Session ID:", "th": "รหัสเซสชันวิเคราะห์:"},
    "lbl_profile": {"en": "Processing Profile:", "th": "โปรไฟล์การประมวลผล:"},
    "lbl_audio": {"en": "Audio Track Status:", "th": "สถานะเสียง:"},
    "audio_value": {"en": "Not included in video overlay (visual analysis export)", "th": "ไม่รวมในวิดีโอ overlay (ส่งออกเฉพาะผลวิเคราะห์ภาพ)"},
    "sec2": {"en": "2. ANALYSIS CAPABILITY COVERAGE", "th": "2. ความครอบคลุมของการวิเคราะห์"},
    "cap_calibration": {"en": "COURT CALIBRATION", "th": "การปรับเทียบสนาม"},
    "cap_tracking": {"en": "PLAYER TRACKING", "th": "การติดตามผู้เล่น"},
    "cap_pose": {"en": "POSE ESTIMATION", "th": "การประมาณท่าทาง (2D)"},
    "cap_ground": {"en": "GROUND POINTS", "th": "จุดสัมผัสพื้น"},
    "cap_identity": {"en": "SEMANTIC IDENTITY", "th": "ตัวตนผู้เล่น P1-P4"},
    "cap_shuttle": {"en": "SHUTTLE TRACKING", "th": "การติดตามลูกขนไก่"},
    "st_available": {"en": "AVAILABLE", "th": "ใช้งานได้"},
    "st_partial": {"en": "PARTIAL", "th": "บางส่วน"},
    "st_unavailable": {"en": "NOT AVAILABLE", "th": "ไม่มีข้อมูล"},
    "st_unvalidated": {"en": "NOT VALIDATED", "th": "ยังไม่ตรวจสอบ"},
    "cap_calibration_detail": {"en": "{n}/{t} valid frames ({p:.1f}%)", "th": "{n}/{t} เฟรมที่ใช้ได้ ({p:.1f}%)"},
    "cap_tracking_detail": {"en": "{n}/{t} frames with players ({p:.1f}%)", "th": "{n}/{t} เฟรมที่พบผู้เล่น ({p:.1f}%)"},
    "cap_pose_detail": {"en": "{n}/{t} fresh pose observations ({p:.1f}%)", "th": "{n}/{t} เฟรมที่มีท่าทางล่าสุด ({p:.1f}%)"},
    "cap_ground_detail": {"en": "Observed anchors with explicit provenance; bbox is visual only", "th": "ใช้จุดที่สังเกตได้เท่านั้น bbox ใช้แสดงผล"},
    "cap_identity_detail": {"en": "Semantic slots are distinct from raw MOT tracks", "th": "ตัวตน P1-P4 แยกจากรหัสติดตาม MOT"},
    "cap_shuttle_detail": {"en": "{n}/{t} observed shuttle locations", "th": "{n}/{t} เฟรมที่พบตำแหน่งลูกขนไก่"},
    "integrity": {
        "en": "SPORTSCOUT TRUST & INTEGRITY STATEMENT:\n"
              "Model observations are estimates; execution does not certify tracking or physical accuracy.\n"
              "Missing observations stay unknown. See ground quality and shuttle evidence before using metrics.",
        "th": "ข้อความเพื่อความน่าเชื่อถือ (SportsScout):\n"
              "ผลทั้งหมดเป็นค่าประมาณจากโมเดลบนวิดีโอ 2 มิติ การประมวลผลสำเร็จไม่ได้รับรองความแม่นยำของการติดตามหรือค่าทางกายภาพ\n"
              "ข้อมูลที่ไม่พบจะแสดงเป็น \"ไม่ทราบ\" ไม่ถูกแทนด้วยศูนย์ กรุณาดูหน้าคุณภาพจุดสัมผัสพื้นและลูกขนไก่ก่อนใช้ตัวเลข",
    },
    # --- player page ---
    "players_title": {"en": "PLAYER MOVEMENT & TACTICAL METRICS", "th": "การเคลื่อนที่ของผู้เล่นและตัวชี้วัดเชิงยุทธวิธี"},
    "players_subtitle": {"en": "Observed player kinematics and tactical court distribution", "th": "การเคลื่อนที่ที่สังเกตได้และการกระจายตัวบนสนาม"},
    "sec3": {"en": "3. INDIVIDUAL ATHLETE SUMMARY", "th": "3. สรุปรายบุคคล"},
    "hdr_player": {"en": "Player", "th": "ผู้เล่น"},
    "hdr_slot": {"en": "Slot", "th": "ตำแหน่ง"},
    "hdr_obs": {"en": "Observations", "th": "จำนวนที่พบ"},
    "hdr_cov": {"en": "Coverage", "th": "สัดส่วน"},
    "hdr_dist": {"en": "Total Distance (m)", "th": "ระยะรวม (ม.)"},
    "hdr_status": {"en": "Status", "th": "สถานะ"},
    "player_n": {"en": "Player {n}", "th": "ผู้เล่น {n}"},
    "dist_value": {"en": "{v:.1f} m", "th": "{v:.1f} ม."},
    "tracked": {"en": "Tracked", "th": "ติดตามได้"},
    "unobserved": {"en": "Unobserved", "th": "ไม่พบ"},
    "sec4": {"en": "4. TACTICAL COURT HEATMAPS", "th": "4. Heatmap การเคลื่อนที่บนสนาม"},
    "heatmap_stored": {"en": "Heatmap graphics generated and stored in package heatmaps/ folder.", "th": "สร้างภาพ Heatmap แล้ว เก็บไว้ในโฟลเดอร์ heatmaps/ ของแพ็กเกจ"},
    "heatmap_available": {"en": "Heatmaps available in export package directory.", "th": "ดู Heatmap ได้ในโฟลเดอร์ของแพ็กเกจที่ส่งออก"},
    # --- diagnostics page ---
    "diag_title": {"en": "TRACKING QUALITY & EXPORT SPECIFICATION", "th": "คุณภาพการติดตามและค่าการส่งออก"},
    "diag_subtitle": {"en": "Verification metrics, scene segment counts, and overlay configuration", "th": "ตัวชี้วัดคุณภาพ จำนวนช่วงฉาก และการตั้งค่า overlay"},
    "sec5": {"en": "5. TRACKING & SCENE QUALITY DIAGNOSTICS", "th": "5. การตรวจวินิจฉัยคุณภาพการติดตามและฉาก"},
    "lbl_total_frames": {"en": "Total Evaluated Frames:", "th": "จำนวนเฟรมที่ประเมิน:"},
    "lbl_cam_segments": {"en": "Camera Segments Detected:", "th": "ช่วงกล้องที่ตรวจพบ:"},
    "cam_segments_value": {"en": "{n} discrete camera segments", "th": "{n} ช่วง"},
    "lbl_scenes": {"en": "Scene Classifications Observed:", "th": "ประเภทฉากที่พบ:"},
    "lbl_cal_frames": {"en": "Court Calibration Frames:", "th": "เฟรมที่ปรับเทียบสนามแล้ว:"},
    "cal_frames_value": {"en": "{n}/{t} marked valid; accuracy unreviewed", "th": "{n}/{t} เฟรมที่ระบบทำเครื่องหมายว่าใช้ได้ ความแม่นยำยังไม่ผ่านการตรวจทาน"},
    "lbl_feet": {"en": "Feet Contact Evidence:", "th": "หลักฐานการสัมผัสพื้น:"},
    "feet_value": {"en": "See recorded ground quality; bbox is visual only", "th": "ดูคุณภาพจุดสัมผัสพื้น กรอบ bbox ใช้แสดงผลเท่านั้น"},
    "lbl_identity": {"en": "Semantic Identity:", "th": "ตัวตนผู้เล่น:"},
    "identity_value": {"en": "Raw tracks separated; accuracy not certified", "th": "แยกจากรหัสติดตามดิบ ความแม่นยำยังไม่ได้รับการรับรอง"},
    "sec6": {"en": "6. APPLIED EXPORT CONFIGURATION", "th": "6. การตั้งค่าที่ใช้ส่งออก"},
    "cfg_preset": {"en": "Selected Export Preset:", "th": "พรีเซ็ตที่เลือก:"},
    "cfg_court": {"en": "Court / Calibration Wireframe:", "th": "เส้นสนาม / กรอบการปรับเทียบ:"},
    "cfg_boxes": {"en": "Player Bounding Boxes:", "th": "กรอบผู้เล่น:"},
    "cfg_pose": {"en": "Pose Skeleton Bones:", "th": "โครงกระดูกท่าทาง:"},
    "cfg_labels": {"en": "Player Identity Labels:", "th": "ป้ายชื่อผู้เล่น:"},
    "cfg_labels_on": {"en": "ENABLED (P1..P4)", "th": "เปิด (P1..P4)"},
    "cfg_track_ids": {"en": "MOT Track IDs:", "th": "รหัสติดตาม MOT:"},
    "cfg_ground": {"en": "Ground Contact Points:", "th": "จุดสัมผัสพื้น:"},
    "cfg_shuttle": {"en": "Shuttle Detection / Trail:", "th": "ลูกขนไก่ / เส้นวิถี:"},
    "cfg_debug": {"en": "Debug Overlay HUD:", "th": "HUD สำหรับดีบัก:"},
    # --- shuttle page ---
    "shuttle_title": {"en": "SHUTTLE SHOTS & LANDING EVIDENCE", "th": "การตีลูกขนไก่และหลักฐานจุดตก"},
    "shuttle_status_AVAILABLE": {"en": "AVAILABLE", "th": "มีข้อมูลจุดตกที่ยืนยันแล้ว"},
    "shuttle_status_INSUFFICIENT_SHUTTLE_METRIC_DATA": {"en": "INSUFFICIENT_SHUTTLE_METRIC_DATA", "th": "ข้อมูลลูกขนไก่ในหน่วยเมตรไม่เพียงพอ"},
    "shuttle_shots": {"en": "Detected Shots: {n}", "th": "จำนวนการตีที่ตรวจพบ: {n}"},
    "shuttle_landings": {"en": "Valid Landing Events: {n}", "th": "เหตุการณ์ลูกตกที่ใช้ได้: {n}"},
    "shuttle_coverage": {"en": "Landing Analytics Coverage: {v}", "th": "สัดส่วนข้อมูลจุดตก: {v}"},
    "shuttle_zone": {"en": "Most Targeted Zone: {z}", "th": "โซนที่ลูกตกมากที่สุด: {z}"},
    "shuttle_oof": {"en": "Out of frame / reacquired: {a} / {b}", "th": "ลูกออกนอกเฟรม / ติดตามกลับมาได้: {a} / {b}"},
    "shuttle_depth": {"en": "Front / Mid / Rear Distribution:", "th": "การกระจาย หน้า / กลาง / หลัง:"},
    "depth_FRONT": {"en": "FRONT", "th": "หน้า"},
    "depth_MID": {"en": "MID", "th": "กลาง"},
    "depth_REAR": {"en": "REAR", "th": "หลัง"},
    "shuttle_zones": {"en": "3x3 Zone Distribution:", "th": "การกระจายตามโซน 3x3:"},
    "shuttle_outcomes": {"en": "IN / OUT / NET / RETURNED:", "th": "ในเส้น / ออก / ติดเน็ต / ตีกลับ:"},
    "shuttle_note1": {"en": "Tracking loss is UNKNOWN, never a landing.", "th": "ลูกขนไก่ที่ติดตามไม่ได้จะเป็น \"ไม่ทราบ\" ไม่นับเป็นจุดตก"},
    "shuttle_note2": {"en": "Airborne 2D detections do not provide physical flight positions.", "th": "การตรวจจับ 2 มิติขณะลูกอยู่กลางอากาศไม่ให้ตำแหน่งการบินจริง"},
    "none": {"en": "none", "th": "ไม่มี"},
    # --- ground quality page ---
    "gq_title": {"en": "GROUND POINT & DISTANCE QUALITY", "th": "คุณภาพจุดสัมผัสพื้นและระยะทาง"},
    "gq_sub": {"en": "Metric estimates require valid calibration and fresh ankle evidence.", "th": "ค่าระยะเป็นเมตรต้องมีการปรับเทียบสนามที่ใช้ได้และหลักฐานข้อเท้าที่เป็นปัจจุบัน"},
    "gq_totals": {"en": "{pid}: total {t} m; active {a} m", "th": "{pid}: ระยะรวม {t} ม.; ระหว่างเล่นจริง {a} ม."},
    "gq_coverage": {"en": "  Metric ground coverage: {c}; valid movements: {v}", "th": "  สัดส่วนจุดพื้นที่ใช้วัดได้: {c}; จำนวนการเคลื่อนที่ที่ใช้ได้: {v}"},
    "gq_raw": {"en": "  Raw / filtered / rejected: {r} / {f} / {j} m", "th": "  ดิบ / กรองแล้ว / ถูกตัดทิ้ง: {r} / {f} / {j} ม."},
    "gq_quality": {"en": "  Ground quality: {q}", "th": "  คุณภาพจุดพื้น: {q}"},
    "gq_legacy": {"en": "Ground metric quality unavailable for this legacy session.", "th": "ไม่มีข้อมูลคุณภาพจุดพื้นสำหรับเซสชันรุ่นเก่านี้"},
    "gq_n1": {"en": "Coverage is eligible ground observations / counted ground observations.", "th": "สัดส่วน = จุดพื้นที่ใช้วัดได้ / จุดพื้นที่นับทั้งหมด"},
    "gq_n2": {"en": "BBox fallback and stale pose are visual only; they add no metric travel.", "th": "bbox สำรองและท่าทางที่เก่าเกินใช้แสดงผลเท่านั้น ไม่นับเป็นระยะเคลื่อนที่"},
    "gq_n3": {"en": "COURT_IDLE contributes to total travel, but not active-play travel.", "th": "ช่วง COURT_IDLE นับในระยะรวม แต่ไม่นับในระยะระหว่างเล่นจริง"},
    "gq_n4": {"en": "Replay, invalid calibration and identity gaps contribute no travel.", "th": "ช่วง replay, การปรับเทียบไม่ผ่าน และช่วงที่ตัวตนไม่ต่อเนื่อง ไม่นับเป็นระยะ"},
    "gq_n5": {"en": "Rejected movement is diagnostic, not confirmed noise.", "th": "ระยะที่ถูกตัดทิ้งใช้วินิจฉัยเท่านั้น ไม่ได้ยืนยันว่าเป็นสัญญาณรบกวน"},
    "gq_n6": {"en": "Uncertainty assumptions and filtering can undercount small motion.", "th": "สมมติฐานความไม่แน่นอนและการกรองอาจทำให้นับการเคลื่อนไหวเล็ก ๆ ขาดไป"},
    "gq_n7": {"en": "Physical accuracy has not been validated against held-out ground truth.", "th": "ความแม่นยำทางกายภาพยังไม่ได้ตรวจสอบเทียบกับข้อมูลอ้างอิงที่กันไว้ (held-out ground truth)"},
    "limits_2d": {
        "en": "2D body keypoints and angles are monocular camera pixel estimates.",
        "th": "จุดข้อต่อและมุมร่างกายเป็นค่าประมาณระดับพิกเซลจากกล้องตัวเดียว (2D) ไม่ใช่จลนศาสตร์ 3 มิติ",
    },
    # --- heatmap images ---
    "hm_overall": {"en": "Overall Player Movement Heatmap", "th": "Heatmap การเคลื่อนที่ของผู้เล่นรวม"},
    "hm_player": {"en": "Player {n} (P{n}) Tactical Heatmap", "th": "Heatmap ผู้เล่น {n} (P{n})"},
    "hm_shuttle": {"en": "Shuttle Trajectory", "th": "วิถีลูกขนไก่"},
    "hm_landing": {"en": "Confirmed Shuttle Landings", "th": "จุดตกลูกขนไก่ที่ยืนยันแล้ว"},
    "hm_insufficient_shuttle": {"en": "INSUFFICIENT_SHUTTLE_METRIC_DATA", "th": "ข้อมูลลูกขนไก่ไม่เพียงพอ"},
    "hm_insufficient": {
        "en": "INSUFFICIENT VALID DATA\n(Calibration or tracking unconfirmed)",
        "th": "ข้อมูลที่ใช้ได้ไม่เพียงพอ\n(ยังไม่ยืนยันการปรับเทียบสนามหรือการติดตาม)",
    },
    "hm_cap_player": {"en": "Numbers = % of valid frames the player was in each zone. Darker = more time. Net at 6.7 m.", "th": "ตัวเลข = % ของเฟรมที่ใช้ได้ซึ่งผู้เล่นอยู่ในช่องนั้น ช่องสีเข้ม = อยู่บ่อยกว่า เน็ตอยู่ที่ 6.7 ม."},
    "hm_cap_overall": {"en": "Numbers = % of valid player-frames in each zone (all players combined).", "th": "ตัวเลข = % ของเฟรมที่ใช้ได้ (ผู้เล่นทั้งหมดรวมกัน) ในแต่ละช่อง"},
    "hm_cap_landing": {"en": "Numbers = % of confirmed landings per zone. Red dots = individual landings.", "th": "ตัวเลข = % ของจุดตกที่ยืนยันแล้วในแต่ละช่อง จุดสีแดง = จุดตกแต่ละครั้ง"},
    "hm_cap_shuttle": {"en": "Numbers = % of observed shuttle positions per zone.", "th": "ตัวเลข = % ของตำแหน่งลูกขนไก่ที่พบในแต่ละช่อง"},
    "hm_legend_pct": {"en": "% of frames", "th": "% ของเฟรม"},
    "hm_legend_landing": {"en": "% of landings", "th": "% ของจุดตก"},
    "hm_legend_shuttle": {"en": "% of positions", "th": "% ของตำแหน่งลูก"},
    "hm_stat_basis": {"en": "Basis: {n} valid frames ({p:.1f}% of all frames)", "th": "อ้างอิง: {n} เฟรมที่ใช้ได้ ({p:.1f}% ของเฟรมทั้งหมด)"},
    "hm_stat_basis_short": {"en": "n = {n} valid frames", "th": "{n} เฟรมที่ใช้ได้"},
    "hm_stat_top": {"en": "Most time in: {zone} ({p:.1f}%)", "th": "อยู่บ่อยที่สุด: {zone} ({p:.1f}%)"},
    "hm_stat_halves": {"en": "Half 0-6.7 m: {a:.1f}%   |   Half 6.7-13.4 m: {b:.1f}%", "th": "ครึ่ง 0-6.7 ม.: {a:.1f}%   |   ครึ่ง 6.7-13.4 ม.: {b:.1f}%"},
    "hm_stat_outside": {"en": "Outside court (not counted): {n} frames", "th": "อยู่นอกสนาม (ไม่นับ): {n} เฟรม"},
    "hm_player_short": {"en": "Player {n} (P{n})", "th": "ผู้เล่น {n} (P{n})"},
    "hm_compare_title": {"en": "Player comparison - same colour scale", "th": "เปรียบเทียบผู้เล่น P1-P4 (สเกลสีเดียวกัน)"},
    "hm_compare_sub": {"en": "Compare where each player spends time on court.", "th": "ดูว่าผู้เล่นแต่ละคนอยู่ตำแหน่งใดบนสนามบ่อยแค่ไหน"},
    "hm_xlabel": {"en": "Court Width (m)", "th": "ความกว้างสนาม (ม.)"},
    "hm_ylabel": {"en": "Court Length (m)", "th": "ความยาวสนาม (ม.)"},
    # --- readme ---
    "readme": {
        "en": "",
        "th": (
            "แพ็กเกจส่งออกผลวิเคราะห์การแข่งขัน SportsScout\n"
            "==========================================\n\n"
            "เซสชันวิเคราะห์: {session}\n"
            "วันที่ส่งออก:    {date}\n"
            "พรีเซ็ต:         {preset}\n"
            "SportsScout:     v0.11.0-pilot.1 (Phase 3.5E Export Foundation)\n\n"
            "โครงสร้างแพ็กเกจ:\n"
            "------------------\n"
            "video/\n"
            "  analysis_overlay.mp4           - วิดีโอพร้อม overlay การติดตามและเส้นสนามตามที่เลือก\n"
            "report/\n"
            "  SportsScout_Report.pdf         - รายงานสรุปภาษาไทย: ข้อมูลการแข่งขัน ตัวชี้วัดผู้เล่น และคุณภาพการติดตาม\n"
            "heatmaps/\n"
            "  player_movement_heatmap.png    - การกระจายการเคลื่อนที่ของผู้เล่นทั้งหมด (% ต่อช่อง)\n"
            "  player_1_heatmap.png ... player_4_heatmap.png - Heatmap รายผู้เล่น (% ต่อช่อง)\n"
            "  player_comparison_heatmap.png  - เปรียบเทียบผู้เล่น P1-P4 ในสเกลสีเดียวกัน\n"
            "  shuttle_trajectory_heatmap.png - ตำแหน่งลูกขนไก่ต่อช่อง หรือระบุว่าข้อมูลไม่เพียงพอ\n"
            "  shuttle_landing_heatmap.png    - จุดตกที่ยืนยันแล้วต่อช่อง หรือระบุว่าข้อมูลไม่เพียงพอ\n"
            "  heatmap_zones.json             - ตัวเลข % ต่อช่องทั้งหมด สำหรับนำไปวิเคราะห์ต่อ\n"
            "data/\n"
            "  shuttle_shots.json             - เหตุการณ์ตีลูกที่ผ่านเกณฑ์หลักฐาน (ค่าที่ไม่ทราบเป็น null)\n"
            "  analysis_summary.json          - ตัวชี้วัดสรุปในรูปแบบที่เครื่องอ่านได้\n"
            "  export_manifest.json           - แหล่งที่มา แฮช และการตั้งค่าการส่งออก\n"
            "README.txt                       - ไฟล์นี้\n\n"
            "ข้อควรทราบ:\n"
            "----------------\n"
            "- Overlay ทุกจุดอ้างอิงตามเลขเฟรมและเวลาของวิดีโอต้นฉบับ\n"
            "- วิดีโอ overlay ไม่มีเสียงจากต้นฉบับ\n"
            "- ข้อมูลที่ไม่พบหรือใช้ไม่ได้จะไม่ถูกแทนด้วยศูนย์\n"
            "- ท่าทางและมุมร่างกายเป็นค่าประมาณ 2 มิติจากกล้องตัวเดียว ไม่ใช่จลนศาสตร์ 3 มิติ\n"
            "- ผลเป็นผลจากโมเดล ยังไม่ผ่านการรับรองความแม่นยำ\n"
            "- Heatmap ใช้เฉพาะเฟรมที่ปรับเทียบสนามผ่านและอยู่ในฉากเล่นปกติ\n"
        ),
    },
}


class Translator:
    """Callable that looks up a report string in the chosen language."""

    def __init__(self, language: str = "en"):
        self.language = normalize_language(language)

    def __call__(self, key: str, **kwargs: object) -> str:
        entry = STRINGS[key]
        text = entry.get(self.language) or entry["en"]
        return text.format(**kwargs) if kwargs else text
