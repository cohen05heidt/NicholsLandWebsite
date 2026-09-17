"""Make every uploaded photo something the website can show, at a sensible size.

The admin at /admin shrinks JPEG/PNG/WebP photos to a 2048px WebP before
upload, but a browser cannot open iPhone HEIC/HEIF or TIFF, so those arrive as
they are. The "Build listing data" workflow runs this before rebuilding the
site. It converts, in the two photo folders the admin writes to:

  assets/img/properties/  HEIC, HEIF, TIFF, BMP, and any JPEG/PNG that is
                          still over 2048px or 1.5 MB (a photo that skipped
                          the browser step)
  assets/img/             HEIC, HEIF, TIFF, BMP only (the site's own images
                          live here and are referenced from the HTML)

Each becomes a WebP no larger than 2048px, the original is removed, and every
listing that named it is pointed at the new file. A file that cannot be read
is left alone with a warning, so one bad upload never stops the build.

Needs:  pip install pillow pillow-heif
Run:    python3 tools/convert-heic.py
"""
import json
import pathlib
import re

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()
Image.MAX_IMAGE_PIXELS = None  # large drone/panorama shots are legitimate

LONGEST_SIDE = 2048
MAX_BYTES = 1_500_000
ALWAYS = {".heic", ".heif", ".tif", ".tiff", ".bmp"}
IF_OVERSIZED = {".jpg", ".jpeg", ".jfif", ".png"}
FOLDERS = {
    pathlib.Path("assets/img/properties"): ALWAYS | IF_OVERSIZED,
    pathlib.Path("assets/img"): ALWAYS,
}
LISTINGS = [pathlib.Path("data/properties"), pathlib.Path("data/commercial")]


def slug(stem):
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "photo"


def oversized(path):
    if path.stat().st_size > MAX_BYTES:
        return True
    try:
        with Image.open(path) as im:
            return max(im.size) > LONGEST_SIDE
    except Exception:  # noqa: BLE001 - unreadable: let the converter report it
        return True


renames = {}  # repo-relative old path -> repo-relative new path
for folder, suffixes in FOLDERS.items():
    if not folder.is_dir():
        continue
    for src in sorted(p for p in folder.iterdir() if p.is_file()):
        ext = src.suffix.lower()
        if ext not in suffixes:
            continue
        if ext in IF_OVERSIZED and not oversized(src):
            continue
        base = slug(src.stem)
        dst = folder / f"{base}.webp"
        n = 2
        while dst.exists():
            dst = folder / f"{base}-{n}.webp"
            n += 1
        try:
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((LONGEST_SIDE, LONGEST_SIDE))
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
                im.save(dst, "WEBP", quality=85)
        except Exception as err:  # noqa: BLE001
            dst.unlink(missing_ok=True)
            print(f"::warning::Could not convert {src} ({err}). Re-upload it as a JPEG.")
            continue
        src.unlink()
        renames[src.as_posix()] = dst.as_posix()
        print(f"{src} -> {dst}")


def repoint(value):
    if isinstance(value, str):
        bare = value.lstrip("/")
        for old, new in renames.items():
            for spelling in (old, old.replace(" ", "%20")):
                if bare == spelling:
                    return value[: len(value) - len(bare)] + new
        return value
    if isinstance(value, list):
        return [repoint(v) for v in value]
    if isinstance(value, dict):
        return {k: repoint(v) for k, v in value.items()}
    return value


if renames:
    for folder in LISTINGS:
        for listing in sorted(folder.glob("*.json")):
            data = json.loads(listing.read_text(encoding="utf-8"))
            fixed = repoint(data)
            if fixed != data:
                listing.write_text(
                    json.dumps(fixed, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                print(f"updated {listing}")
