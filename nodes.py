# -*- coding: utf-8 -*-
import json
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

from .metadata import read_metadata
from .paths_util import resolve_image, vault_path


def _empty_mask():
    return torch.zeros((1, 64, 64), dtype=torch.float32)


def _load_tensors(path: str):
    img = Image.open(path)
    images = []
    masks = []
    for frame in ImageSequence.Iterator(img):
        frame = ImageOps.exif_transpose(frame)
        if frame.mode == "I":
            frame = frame.point(lambda i: i * (1 / 255))
        rgb = frame.convert("RGB")
        arr = np.array(rgb).astype(np.float32) / 255.0
        images.append(torch.from_numpy(arr)[None,])
        if "A" in frame.getbands():
            alpha = np.array(frame.getchannel("A")).astype(np.float32) / 255.0
            masks.append((1.0 - torch.from_numpy(alpha)).unsqueeze(0))
        else:
            masks.append(_empty_mask())
    img.close()
    image = torch.cat(images, dim=0) if len(images) > 1 else images[0]
    mask = torch.cat(masks, dim=0) if len(masks) > 1 else masks[0]
    return image, mask


class AtelierGallery:
    CATEGORY = "image/atelier"
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("image", "mask", "prompt", "negative", "metadata")
    FUNCTION = "load"
    DESCRIPTION = "Browse local folders, read prompt/EXIF, output the selected image."

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder": ("STRING", {"default": "", "multiline": False}),
                "filename": ("STRING", {"default": "", "multiline": False}),
            }
        }

    @classmethod
    def IS_CHANGED(cls, folder="", filename="", **_kwargs):
        if not filename:
            return ""
        try:
            path = resolve_image(folder, filename)
            return f"{path}:{os.path.getmtime(path)}"
        except Exception:
            return filename

    @classmethod
    def VALIDATE_INPUTS(cls, folder="", filename="", **_kwargs):
        if not filename:
            return "Select an image in the gallery"
        try:
            resolve_image(folder, filename)
            return True
        except Exception as exc:
            return str(exc)

    def load(self, folder, filename, **_kwargs):
        # Old workflows stored path in custom_folder + subfolder
        if not folder:
            folder = _kwargs.get("custom_folder") or ""
            sub = _kwargs.get("subfolder") or ""
            if sub:
                folder = os.path.join(folder, sub) if folder else sub
        path = resolve_image(folder, filename)
        image, mask = _load_tensors(path)
        meta = read_metadata(path)
        meta["filename"] = filename
        meta["folder"] = folder
        meta["path"] = path
        prompt = meta.get("prompt") or ""
        negative = meta.get("negative") or ""
        return (image, mask, prompt, negative, json.dumps(meta, ensure_ascii=False, default=str))


class AtelierPromptVault:
    CATEGORY = "image/atelier"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "negative")
    FUNCTION = "pick"
    DESCRIPTION = "Load a saved prompt from the Atelier vault."

    @classmethod
    def INPUT_TYPES(cls):
        titles = ["(empty)"]
        try:
            path = vault_path()
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, list):
                    titles = [
                        f'{i}. {item.get("title") or "untitled"}'
                        for i, item in enumerate(data)
                        if isinstance(item, dict)
                    ] or titles
        except Exception:
            pass
        return {"required": {"entry": (titles,)}}

    @classmethod
    def IS_CHANGED(cls, entry="", **_kwargs):
        path = vault_path()
        if os.path.isfile(path):
            return f"{entry}:{os.path.getmtime(path)}"
        return entry

    def pick(self, entry, **_kwargs):
        if not entry or entry == "(empty)":
            return ("", "")
        try:
            index = int(str(entry).split(".", 1)[0])
        except Exception:
            return ("", "")
        path = vault_path()
        if not os.path.isfile(path):
            return ("", "")
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list) or index < 0 or index >= len(data):
            return ("", "")
        item = data[index]
        return (str(item.get("prompt") or ""), str(item.get("negative") or ""))


NODE_CLASS_MAPPINGS = {
    "AtelierGallery": AtelierGallery,
    "AtelierPromptVault": AtelierPromptVault,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AtelierGallery": "Atelier Gallery",
    "AtelierPromptVault": "Atelier Prompt Vault",
}
