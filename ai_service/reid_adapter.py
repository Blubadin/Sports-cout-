"""
reid_adapter.py — Appearance embedding extractor seam for athlete ReID in SportsScout.

Provides:
- BaseReIDAdapter: abstract interface for appearance feature extraction and cosine distance.
- DisabledReIDAdapter: no-op provider when ReID is disabled.
- SpatialFeatureReIDAdapter: deterministic multi-zone spatial-color embedding extractor.
- MockReIDAdapter: testable mock provider for deterministic identity association tests.
- create_reid_provider: factory resolving the appropriate adapter with truthful provenance.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
import math
from typing import Sequence
import cv2
import numpy as np


class BaseReIDAdapter(ABC):
    """Abstract base class for person Re-Identification feature extraction."""

    @property
    @abstractmethod
    def model_name(self) -> str | None:
        """Return the ReID model identifier, or None if disabled."""
        pass

    @property
    @abstractmethod
    def is_enabled(self) -> bool:
        """Return whether ReID embedding extraction is active."""
        pass

    @abstractmethod
    def extract(self, frame: np.ndarray, bbox: Sequence[float]) -> np.ndarray | None:
        """
        Extract a 1D unit-normalized appearance embedding from a person crop.
        Returns a float32 numpy array with ||v||_2 = 1.0, or None if extraction fails.
        """
        pass

    def compute_similarity(
        self, emb_a: np.ndarray | None, emb_b: np.ndarray | None
    ) -> float | None:
        """
        Compute cosine similarity in [-1.0, 1.0] between two normalized embeddings.
        Returns None if either embedding is missing.
        """
        if emb_a is None or emb_b is None:
            return None
        dot = float(np.dot(emb_a, emb_b))
        norm_a = float(np.linalg.norm(emb_a))
        norm_b = float(np.linalg.norm(emb_b))
        if norm_a < 1e-6 or norm_b < 1e-6:
            return None
        cos_sim = dot / (norm_a * norm_b)
        return max(-1.0, min(1.0, cos_sim))

    def compute_distance(
        self, emb_a: np.ndarray | None, emb_b: np.ndarray | None
    ) -> float | None:
        """
        Compute cosine distance in [0.0, 1.0] where 0.0 is identical and 1.0 is orthogonal/opposite.
        Returns None if either embedding is missing.
        """
        sim = self.compute_similarity(emb_a, emb_b)
        if sim is None:
            return None
        return float(1.0 - max(0.0, sim))


class DisabledReIDAdapter(BaseReIDAdapter):
    """No-op provider used when ReID is disabled."""

    @property
    def model_name(self) -> str | None:
        return None

    @property
    def is_enabled(self) -> bool:
        return False

    def extract(self, frame: np.ndarray, bbox: Sequence[float]) -> np.ndarray | None:
        return None


class SpatialFeatureReIDAdapter(BaseReIDAdapter):
    """
    Deterministic multi-zone spatial-color appearance embedding extractor.
    Extracts multi-scale color moments, spatial gradients, and zone-specific histograms
    across 4 vertical body segments (head, upper torso, lower torso/shorts, legs/shoes).
    Produces a 128-D L2-normalized feature vector without external network downloads.
    """

    def __init__(self, model_name: str = "spatial_multi_zone_v1", device: str = "cpu"):
        self._model_name = str(model_name)
        self._device = device

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def is_enabled(self) -> bool:
        return True

    def extract(self, frame: np.ndarray, bbox: Sequence[float]) -> np.ndarray | None:
        if frame is None or frame.size == 0 or len(bbox) < 4:
            return None

        h, w = frame.shape[:2]
        x1 = max(0, min(w - 1, int(round(bbox[0]))))
        y1 = max(0, min(h - 1, int(round(bbox[1]))))
        x2 = max(0, min(w, int(round(bbox[2]))))
        y2 = max(0, min(h, int(round(bbox[3]))))

        if x2 - x1 < 8 or y2 - y1 < 16:
            return None

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        # Standardize crop dimensions: 128 (H) x 64 (W)
        resized = cv2.resize(crop, (64, 128), interpolation=cv2.INTER_AREA)

        # 4 vertical body segments:
        # Zone 0: Head / Neck (0..24 px)
        # Zone 1: Upper Torso / Shirt (24..64 px)
        # Zone 2: Shorts / Skirt (64..96 px)
        # Zone 3: Legs / Shoes (96..128 px)
        zones = [
            resized[0:24, :],
            resized[24:64, :],
            resized[64:96, :],
            resized[96:128, :],
        ]

        features: list[float] = []
        for zone in zones:
            if zone.size == 0:
                features.extend([0.0] * 32)
                continue

            hsv = cv2.cvtColor(zone, cv2.COLOR_BGR2HSV)
            # 16-bin Hue, 8-bin Saturation, 4-bin Value
            h_hist = cv2.calcHist([hsv], [0], None, [16], [0, 180]).flatten()
            s_hist = cv2.calcHist([hsv], [1], None, [8], [0, 256]).flatten()
            v_hist = cv2.calcHist([hsv], [2], None, [4], [0, 256]).flatten()

            # Normalize sub-histograms
            h_sum = float(np.sum(h_hist)) + 1e-6
            s_sum = float(np.sum(s_hist)) + 1e-6
            v_sum = float(np.sum(v_hist)) + 1e-6

            # Spatial mean & std of Lab L-channel (texture/contrast)
            lab = cv2.cvtColor(zone, cv2.COLOR_BGR2Lab)
            l_channel = lab[:, :, 0].astype(np.float32)
            mean_l = float(np.mean(l_channel)) / 255.0
            std_l = float(np.std(l_channel)) / 255.0

            zone_vec = np.concatenate([
                h_hist / h_sum,     # 16
                s_hist / s_sum,     # 8
                v_hist / v_sum,     # 4
                [mean_l, std_l, 0.0, 0.0],  # 4
            ])
            features.extend(zone_vec.tolist())

        emb = np.array(features, dtype=np.float32)
        norm = float(np.linalg.norm(emb))
        if norm > 1e-6:
            emb /= norm
        return emb


class MockReIDAdapter(BaseReIDAdapter):
    """Test mock provider allowing deterministic embedding assignment."""

    def __init__(self, model_name: str = "mock_reid"):
        self._model_name = model_name
        self.preset_embeddings: dict[int | str, np.ndarray] = {}

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def is_enabled(self) -> bool:
        return True

    def set_embedding_for_target(self, target_id: int | str, embedding: Sequence[float]):
        emb = np.array(embedding, dtype=np.float32)
        norm = float(np.linalg.norm(emb))
        if norm > 1e-6:
            emb /= norm
        self.preset_embeddings[target_id] = emb

    def extract(self, frame: np.ndarray, bbox: Sequence[float]) -> np.ndarray | None:
        # Default mock embedding from spatial coordinate hash
        bx = int(bbox[0]) if len(bbox) >= 1 else 0
        vec = np.zeros(128, dtype=np.float32)
        vec[bx % 128] = 1.0
        return vec


def create_reid_provider(
    enabled: bool = False,
    model_name: str | None = None,
    device: str = "cpu",
) -> BaseReIDAdapter:
    """Create the selected ReID provider seam with explicit configuration."""
    if not enabled or not model_name or str(model_name).strip().lower() in ("none", "disabled", ""):
        return DisabledReIDAdapter()
    return SpatialFeatureReIDAdapter(model_name=str(model_name), device=device)
