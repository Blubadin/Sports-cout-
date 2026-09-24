"""Configuration and authorization policy for the local AI sidecar."""

from __future__ import annotations

from dataclasses import dataclass
import hmac
import ipaddress
import os
from pathlib import Path
import re
from typing import Mapping, Sequence


class SecurityConfigurationError(ValueError):
    """A requested bind would expose the service without its required controls."""


class LegacySourceError(ValueError):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def is_loopback_host(host: str) -> bool:
    normalized = host.strip().strip("[]").lower()
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def is_non_loopback_interface(host: str | None) -> bool:
    """Only concrete socket addresses are trusted for the extra ASGI guard."""
    if not host:
        return False
    try:
        return not ipaddress.ip_address(host.strip().strip("[]")).is_loopback
    except ValueError:
        return False


def _enabled(value: str | None) -> bool:
    return bool(value and value.strip().lower() in {"1", "true", "yes", "on"})


@dataclass(frozen=True)
class SecuritySettings:
    host: str = "127.0.0.1"
    remote_enabled: bool = False
    auth_token: str | None = None
    legacy_direct_sources: bool = False

    @classmethod
    def from_env(cls, values: Mapping[str, str] | None = None) -> SecuritySettings:
        source = os.environ if values is None else values
        host = source.get("SPORTSCOUT_AI_HOST", "127.0.0.1").strip() or "127.0.0.1"
        token = source.get("SPORTSCOUT_AI_AUTH_TOKEN", "").strip() or None
        return cls(
            host=host,
            remote_enabled=_enabled(source.get("SPORTSCOUT_AI_REMOTE_ENABLED")),
            auth_token=token,
            legacy_direct_sources=_enabled(source.get("SPORTSCOUT_AI_LEGACY_DIRECT_SOURCES")),
        )

    @property
    def requires_auth(self) -> bool:
        return self.remote_enabled or self.auth_token is not None

    def validate_bind(self) -> None:
        if not is_loopback_host(self.host) and not self.remote_enabled:
            raise SecurityConfigurationError("Non-loopback AI host requires SPORTSCOUT_AI_REMOTE_ENABLED=true")
        if self.remote_enabled and self.auth_token is None:
            raise SecurityConfigurationError("Remote AI mode requires SPORTSCOUT_AI_AUTH_TOKEN")

    def may_serve_interface(self, host: str | None) -> bool:
        return not is_non_loopback_interface(host) or (self.remote_enabled and self.auth_token is not None)

    def _matches_token(self, supplied: str) -> bool:
        expected = self.auth_token
        return expected is not None and hmac.compare_digest(
            supplied.encode("utf-8"), expected.encode("utf-8")
        )

    def authorize_bearer(self, authorization: str | None) -> bool:
        if not self.requires_auth:
            return True
        if not authorization:
            return False
        scheme, separator, credential = authorization.partition(" ")
        return bool(separator and scheme.lower() == "bearer" and credential and self._matches_token(credential))

    def authorize_websocket(self, authorization: str | None, protocols: Sequence[str]) -> bool:
        if not self.requires_auth:
            return True
        if self.authorize_bearer(authorization):
            return True
        return "sportscout" in protocols and any(
            protocol.startswith("auth.") and self._matches_token(protocol[5:])
            for protocol in protocols
        )

    def validate_legacy_source(self, source: str) -> None:
        if source == "demo":
            return
        if source.startswith(("\\\\", "//")) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", source):
            raise LegacySourceError(400, "Network and UNC video sources are unsupported")
        if not self.legacy_direct_sources:
            raise LegacySourceError(403, "Direct webcam and local video sources are disabled")
        if source.isdecimal():
            return
        if not Path(source).is_file():
            raise LegacySourceError(404, "Video file not found")
