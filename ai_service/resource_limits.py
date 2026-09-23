"""Application resource limits, independent of authentication and inference."""

import os
from typing import Annotated

from pydantic import Field, TypeAdapter, ValidationError


DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024**3


class ResourceConfigError(ValueError):
    """Safe, value-free error suitable for an API response."""


def bounded_number(value, name: str, minimum: float, maximum: float, *, integer=False):
    number_type = int if integer else float
    constraint = Field(strict=True, ge=minimum, le=maximum, **({} if integer else {'allow_inf_nan': False}))
    try:
        return TypeAdapter(Annotated[number_type, constraint]).validate_python(value)
    except ValidationError:
        kind = 'integer' if integer else 'finite number'
        raise ResourceConfigError(f'{name} must be a {kind} between {minimum} and {maximum}') from None


def get_max_upload_bytes() -> int:
    raw = os.getenv('SPORTSCOUT_AI_MAX_UPLOAD_BYTES', str(DEFAULT_MAX_UPLOAD_BYTES))
    if len(raw) > 13 or not raw.isascii() or not raw.isdecimal() or not 0 < int(raw) <= 1024**4:
        raise ResourceConfigError('SPORTSCOUT_AI_MAX_UPLOAD_BYTES must be an integer from 1 to 1099511627776')
    return int(raw)


def validate_processing_numbers(config: dict) -> None:
    # Validate both aliases, even if one would otherwise shadow the other.
    rules = (
        ('frame_stride', 'frameStride', 1, 1000, True),
        ('pose_stride', 'poseStride', 1, 1000, True),
        ('detector_input_size', 'detectorInputSize', 1, 2048, True),
        ('court_roi_margin_px', 'courtRoiMarginPx', 0, 8192, True),
        ('court_roi_margin_m', 'courtRoiMarginM', 0, 100, False),
        ('confidence_threshold', 'confidenceThreshold', 0, 1, False),
        ('shuttle_window_size', 'shuttleWindowSize', 2, 32, True),
        ('shuttle_input_width', 'shuttleInputWidth', 1, 2048, True),
        ('shuttle_input_height', 'shuttleInputHeight', 1, 2048, True),
        ('shuttle_confidence_threshold', 'shuttleConfidenceThreshold', 0, 1, False),
        ('shuttle_centroid_relative_threshold', 'shuttleCentroidRelativeThreshold', 0, 1, False),
    )
    for snake, camel, lower, upper, integer in rules:
        for key in (snake, camel):
            if key in config:
                bounded_number(config[key], key, lower, upper, integer=integer)


def validate_shuttle_numbers(config) -> None:
    bounded_number(config.window_size, 'shuttle_window_size', 2, 32, integer=True)
    bounded_number(config.input_width, 'shuttle_input_width', 1, 2048, integer=True)
    bounded_number(config.input_height, 'shuttle_input_height', 1, 2048, integer=True)
    bounded_number(config.confidence_threshold, 'shuttle_confidence_threshold', 0, 1)
    bounded_number(config.centroid_relative_threshold, 'shuttle_centroid_relative_threshold', 0, 1)
    if config.centroid_relative_threshold == 0:
        raise ResourceConfigError('shuttle_centroid_relative_threshold must be greater than zero')
    if config.window_size * 3 * config.input_width * config.input_height > 16 * 1024**2:
        raise ResourceConfigError('Shuttle input tensor must not exceed 16777216 float32 elements (64 MiB)')


def safe_filename(value: str) -> str:
    # Recognize either path separator regardless of the server platform.
    return value.replace('\\', '/').rsplit('/', 1)[-1]
