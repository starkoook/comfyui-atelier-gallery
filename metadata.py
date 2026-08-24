import json
import os
import re
from typing import Any

from PIL import Image, ExifTags


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}

_CLIP_POS = {
    "CLIPTextEncode",
    "CLIPTextEncodeSDXL",
    "CLIPTextEncodeSD3",
    "CLIPTextEncodeFlux",
    "CLIPTextEncodeHunyuanDiT",
    "CLIPTextEncodeLumina2",
}
_CLIP_NEG = {"CLIPTextEncodeNegative"}


def is_image_name(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in IMAGE_EXT


def read_metadata(path: str) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "prompt": "",
        "negative": "",
        "parameters": {},
        "software": "",
        "raw": "",
    }
    try:
        with Image.open(path) as img:
            info = {str(k): v for k, v in (img.info or {}).items()}
            _apply_png_text(meta, info)
            _apply_exif(meta, img)
    except Exception as exc:
        meta["error"] = str(exc)
        return meta

    if not meta["prompt"] and meta.get("raw"):
        _apply_a1111(meta, str(meta["raw"]))
    return meta


def _apply_png_text(meta: dict[str, Any], info: dict[str, Any]) -> None:
    for key in ("parameters", "prompt", "Comment", "comment", "Description", "description"):
        value = info.get(key)
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8", "ignore")
            except Exception:
                continue
        if not isinstance(value, str) or not value.strip():
            continue
        if not meta["raw"]:
            meta["raw"] = value
        if key == "parameters":
            _apply_a1111(meta, value)
        elif key == "prompt":
            if value.lstrip().startswith("{") or value.lstrip().startswith("["):
                _apply_comfy_prompt(meta, value)
            elif not meta["prompt"]:
                meta["prompt"] = value.strip()
        elif not meta["prompt"]:
            meta["prompt"] = value.strip()

    workflow = info.get("workflow")
    if isinstance(workflow, str) and workflow.strip().startswith("{") and not meta["prompt"]:
        _apply_comfy_workflow(meta, workflow)

    software = info.get("Software") or info.get("software")
    if isinstance(software, str):
        meta["software"] = software


def _apply_a1111(meta: dict[str, Any], text: str) -> None:
    meta["raw"] = text
    steps = re.search(r"\nSteps:\s*", text)
    head = text[: steps.start()] if steps else text
    tail = text[steps.start() + 1 :] if steps else ""
    neg = re.search(r"\nNegative prompt:\s*(.*)$", head, re.S)
    if neg:
        meta["prompt"] = head[: neg.start()].strip()
        meta["negative"] = neg.group(1).strip()
    else:
        meta["prompt"] = head.strip()
    for chunk in tail.split(","):
        if ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        meta["parameters"][key.strip()] = value.strip()
    if not meta["software"]:
        meta["software"] = "Stable Diffusion"


def _apply_comfy_prompt(meta: dict[str, Any], raw: str) -> None:
    try:
        data = json.loads(raw)
    except Exception:
        if not meta["prompt"]:
            meta["prompt"] = raw.strip()
        return
    meta["software"] = meta["software"] or "ComfyUI"
    pos, neg = _collect_clip(data)
    if pos and not meta["prompt"]:
        meta["prompt"] = pos
    if neg and not meta["negative"]:
        meta["negative"] = neg


def _apply_comfy_workflow(meta: dict[str, Any], raw: str) -> None:
    try:
        data = json.loads(raw)
    except Exception:
        return
    meta["software"] = meta["software"] or "ComfyUI"
    nodes = data.get("nodes") if isinstance(data, dict) else None
    if not isinstance(nodes, list):
        return
    pos: list[str] = []
    neg: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        ntype = str(node.get("type") or "")
        title = str(node.get("title") or "").lower()
        widgets = node.get("widgets_values")
        text = ""
        if isinstance(widgets, list) and widgets and isinstance(widgets[0], str):
            text = widgets[0]
        elif isinstance(widgets, dict):
            maybe = widgets.get("text")
            if isinstance(maybe, str):
                text = maybe
        if not text.strip():
            continue
        if "negative" in title or ntype in _CLIP_NEG:
            neg.append(text.strip())
        elif ntype in _CLIP_POS or "CLIPText" in ntype:
            pos.append(text.strip())
    if pos and not meta["prompt"]:
        meta["prompt"] = "\n".join(pos)
    if neg and not meta["negative"]:
        meta["negative"] = "\n".join(neg)


def _collect_clip(data: Any) -> tuple[str, str]:
    if not isinstance(data, dict):
        return "", ""
    pos: list[str] = []
    neg: list[str] = []
    nodes = data.values() if not {"class_type", "inputs"} <= set(data.keys()) else [data]
    for node in nodes:
        if not isinstance(node, dict):
            continue
        ctype = str(node.get("class_type") or "")
        title = str((node.get("_meta") or {}).get("title") or "").lower()
        inputs = node.get("inputs") if isinstance(node.get("inputs"), dict) else {}
        text = inputs.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        if "negative" in title or ctype in _CLIP_NEG:
            neg.append(text.strip())
        elif ctype in _CLIP_POS or "CLIPText" in ctype:
            pos.append(text.strip())
    return "\n".join(pos), "\n".join(neg)


def _apply_exif(meta: dict[str, Any], img: Image.Image) -> None:
    try:
        exif = img.getexif()
    except Exception:
        return
    if not exif:
        return
    tags = {}
    for k, v in exif.items():
        name = ExifTags.TAGS.get(k, str(k))
        if isinstance(v, bytes):
            continue
        tags[name] = v
    if tags.get("Make") or tags.get("Model"):
        make = str(tags.get("Make") or "").strip()
        model = str(tags.get("Model") or "").strip()
        meta["camera"] = (make + " " + model).strip()
    if tags.get("LensModel"):
        meta["lens"] = str(tags["LensModel"])
    if tags.get("FNumber"):
        meta["aperture"] = f"f/{tags['FNumber']}"
    if tags.get("ExposureTime"):
        meta["shutter"] = str(tags["ExposureTime"])
    if tags.get("ISOSpeedRatings"):
        meta["iso"] = tags["ISOSpeedRatings"]
    if tags.get("FocalLength"):
        meta["focalLength"] = f"{tags['FocalLength']}mm"
    if tags.get("Software") and not meta["software"]:
        meta["software"] = str(tags["Software"])
    if tags.get("DateTimeOriginal") or tags.get("DateTime"):
        meta["dateTaken"] = str(tags.get("DateTimeOriginal") or tags.get("DateTime"))
    user_comment = tags.get("UserComment")
    if isinstance(user_comment, str) and user_comment and not meta["prompt"]:
        if "Negative prompt:" in user_comment:
            _apply_a1111(meta, user_comment)
        else:
            meta["prompt"] = user_comment
