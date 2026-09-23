"""Conservative container gate for the Tracking Lab's supported upload formats."""

from pathlib import Path


def has_video_container_header(path: Path) -> bool:
    """Check actual bytes, before OpenCV validates the container and decodes it.

    OpenCV also accepts still-image formats, so successful VideoCapture alone
    is insufficient. Accept the Lab's AVI, MP4/M4V/MOV and MKV/WebM containers.
    This is only a gate: an allowed header never substitutes for real decoding.
    """
    with path.open('rb') as uploaded:
        header = uploaded.read(32)
    if len(header) < 12:
        return False
    if header[:4] == b'RIFF' and header[8:12] == b'AVI ':
        return True
    if header[:4] == b'\x1a\x45\xdf\xa3':  # EBML, then decoded as Matroska/WebM
        return True
    if header[4:8] == b'ftyp':
        # Explicit video brands exclude image containers such as AVIF/HEIF.
        return header[8:12] in {
            b'isom', b'iso2', b'iso3', b'iso4', b'iso5', b'iso6', b'iso7', b'iso8',
            b'iso9', b'mp41', b'mp42', b'avc1', b'hvc1', b'hev1', b'dash',
            b'M4V ', b'M4VH', b'M4VP', b'qt  ', b'MSNV',
        }
    # Older QuickTime files can start with an atom rather than an ftyp box.
    return header[4:8] in {b'moov', b'mdat', b'wide', b'free', b'skip'} and int.from_bytes(header[:4], 'big') >= 8
