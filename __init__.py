# -*- coding: utf-8 -*-
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

try:
    from . import server as _server  # noqa: F401
except Exception as exc:
    print(f"[Atelier Gallery] HTTP routes not registered: {exc}")

WEB_DIRECTORY = "./js"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
