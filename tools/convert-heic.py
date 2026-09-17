"""Turn iPhone photos (HEIC/HEIF) into WebP the website can show.

iPhones save photos as HEIC. No desktop browser can display one, and the
admin at /admin cannot convert them yet (sveltia/sveltia-cms#741), so a HEIC
uploaded there would sit on the listing as a blank square. The "Build listing
data" workflow runs this before rebuilding the site: every HEIC in the photo
folder becomes a WebP no larger than 2048px, the original is removed, and
every listing that named it is pointed at the new file.

Needs:  pip install pillow pillow-heif
Run:    python3 tools/convert-heic.py
"""
import json
import pathlib
import re

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

PHOTOS = pathlib.Path("assets/img/properties")
LISTINGS = [pathlib.Path("data/properties"), pathlib.Path("data/commercial")]
LONGEST_SIDE = 2048


def slug(stem):
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "photo"


renames = {}
for src in sorted(PHOTOS.iterdir()):
    if src.suffix.lower() not in (".heic", ".heif"):
        continue
    base = slug(src.stem)
    dst = PHOTOS / f"{base}.webp"
    n = 2
    while dst.exists():
        dst = PHOTOS / f"{base}-{n}.webp"
        n += 1
    # One unreadable file must not stop every other listing from publishing.
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            im.thumbnail((LONGEST_SIDE, LONGEST_SIDE))
            im.convert("RGB").save(dst, "WEBP", quality=85)
    except Exception as err:  # noqa: BLE001
        dst.unlink(missing_ok=True)
        print(f"::warning::Could not convert {src.name} ({err}). Re-upload it as a JPEG.")
        continue
    src.unlink()
    renames[src.name] = dst.name
    print(f"{src.name} -> {dst.name}")


def repoint(value):
    if isinstance(value, str):
        for old, new in renames.items():
            for spelling in (old, old.replace(" ", "%20")):
                if value == spelling or value.endswith("/" + spelling):
                    return value[: len(value) - len(spelling)] + new
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
