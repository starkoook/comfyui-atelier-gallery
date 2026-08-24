import json
import os
import time
import uuid

from aiohttp import web

from .metadata import read_metadata
from .paths_util import list_images, resolve_image, vault_path

try:
    from server import PromptServer

    ROUTES = PromptServer.instance.routes
except Exception as exc:  # pragma: no cover
    print("[Atelier Gallery] PromptServer missing:", exc)
    ROUTES = None


def _bind(path, handler, method="GET"):
    if ROUTES is None:
        return
    getattr(ROUTES, method.lower())(path)(handler)
    if not path.startswith("/api/"):
        getattr(ROUTES, method.lower())("/api" + path)(handler)


async def gallery_list(request):
    source = request.rel_url.query.get("source", "output")
    subfolder = request.rel_url.query.get("subfolder", "")
    custom_folder = request.rel_url.query.get("custom_folder", "")
    query = request.rel_url.query.get("q", "")
    try:
        items = list_images(source, subfolder, custom_folder, query)
        return web.json_response({"images": items, "count": len(items)})
    except Exception as exc:
        return web.json_response({"error": str(exc), "images": []}, status=400)


async def gallery_meta(request):
    source = request.rel_url.query.get("source", "output")
    filename = request.rel_url.query.get("filename", "")
    subfolder = request.rel_url.query.get("subfolder", "")
    custom_folder = request.rel_url.query.get("custom_folder", "")
    try:
        path = resolve_image(source, filename, subfolder, custom_folder)
        meta = read_metadata(path)
        meta["filename"] = filename
        meta["subfolder"] = subfolder
        meta["source"] = source
        return web.json_response(meta)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=400)


async def gallery_file(request):
    source = request.rel_url.query.get("source", "output")
    filename = request.rel_url.query.get("filename", "")
    subfolder = request.rel_url.query.get("subfolder", "")
    custom_folder = request.rel_url.query.get("custom_folder", "")
    try:
        path = resolve_image(source, filename, subfolder, custom_folder)
        return web.FileResponse(path)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=400)


def _read_vault():
    path = vault_path()
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else []


def _write_vault(items):
    path = vault_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


async def prompts_get(request):
    return web.json_response({"prompts": _read_vault()})


async def prompts_post(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    title = str(body.get("title") or "untitled").strip()
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return web.json_response({"error": "prompt 为空"}, status=400)
    item = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "prompt": prompt,
        "negative": str(body.get("negative") or ""),
        "source": body.get("source") or "",
        "filename": body.get("filename") or "",
        "createdAt": int(time.time() * 1000),
    }
    items = [item] + _read_vault()
    _write_vault(items[:200])
    return web.json_response({"ok": True, "prompt": item})


async def prompts_delete(request):
    pid = request.rel_url.query.get("id", "")
    items = [x for x in _read_vault() if str(x.get("id")) != pid]
    _write_vault(items)
    return web.json_response({"ok": True})


_bind("/atelier/gallery", gallery_list)
_bind("/atelier/metadata", gallery_meta)
_bind("/atelier/file", gallery_file)
_bind("/atelier/prompts", prompts_get)
_bind("/atelier/prompts", prompts_post, method="POST")
_bind("/atelier/prompts", prompts_delete, method="DELETE")
