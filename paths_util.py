# -*- coding: utf-8 -*-
import os
import string

import folder_paths

from .metadata import is_image_name

MAX_LIST = 400


def _drives():
    if os.name != "nt":
        return ["/"]
    found = []
    try:
        import ctypes

        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for i, letter in enumerate(string.ascii_uppercase):
            if bitmask & (1 << i):
                found.append(f"{letter}:\\")
    except Exception:
        for letter in string.ascii_uppercase:
            root = f"{letter}:\\"
            if os.path.isdir(root):
                found.append(root)
    return found or ["C:\\"]


def list_roots():
    items = []
    seen = set()

    def add(label, path):
        path = os.path.abspath(path) if path else ""
        if not path or path in seen or not os.path.isdir(path):
            return
        seen.add(path)
        items.append({"name": label, "path": path, "kind": "root"})

    try:
        add("output", folder_paths.get_output_directory())
        add("input", folder_paths.get_input_directory())
        add("temp", folder_paths.get_temp_directory())
    except Exception:
        pass
    add("home", os.path.expanduser("~"))
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    add("Desktop", desktop)
    pictures = os.path.join(os.path.expanduser("~"), "Pictures")
    add("Pictures", pictures)
    for drive in _drives():
        add(drive, drive)
    return items


def is_within(root: str, path: str) -> bool:
    root = os.path.abspath(root)
    path = os.path.abspath(path)
    try:
        return os.path.commonpath([root, path]) == root
    except ValueError:
        return False


def parent_dir(path: str):
    path = os.path.abspath(path)
    parent = os.path.dirname(path.rstrip("\\/"))
    if os.name == "nt":
        if path.endswith(":\\") or path.endswith(":/"):
            return None
        if parent == path:
            return None
    else:
        if path == "/":
            return None
    return parent


def resolve_image(folder: str, filename: str) -> str:
    filename = os.path.basename((filename or "").replace("\\", "/"))
    if not filename:
        raise ValueError("No image selected")
    folder = os.path.abspath((folder or "").strip())
    if not os.path.isdir(folder):
        raise ValueError(f"Folder not found: {folder}")
    path = os.path.abspath(os.path.join(folder, filename))
    if not is_within(folder, path):
        raise ValueError("Path escapes folder")
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    return path


def browse(path: str, query: str = ""):
    path = (path or "").strip()
    if not path:
        return {"cwd": "", "parent": None, "folders": list_roots(), "images": []}

    cwd = os.path.abspath(path)
    if not os.path.isdir(cwd):
        raise ValueError(f"Folder not found: {cwd}")

    q = (query or "").strip().lower()
    folders = []
    images = []
    try:
        names = os.listdir(cwd)
    except OSError as exc:
        raise ValueError(str(exc)) from exc

    for name in names:
        if name.startswith("."):
            continue
        if q and q not in name.lower():
            continue
        full = os.path.join(cwd, name)
        try:
            if os.path.isdir(full):
                folders.append({"name": name, "path": os.path.abspath(full), "kind": "folder"})
            elif os.path.isfile(full) and is_image_name(name):
                st = os.stat(full)
                images.append(
                    {
                        "filename": name,
                        "folder": cwd,
                        "mtime": st.st_mtime,
                        "size": st.st_size,
                    }
                )
        except OSError:
            continue
        if len(folders) + len(images) >= MAX_LIST:
            break

    folders.sort(key=lambda x: x["name"].lower())
    images.sort(key=lambda x: x["mtime"], reverse=True)
    return {
        "cwd": cwd,
        "parent": parent_dir(cwd),
        "folders": folders,
        "images": images[:MAX_LIST],
    }


def user_dir() -> str:
    if hasattr(folder_paths, "get_user_directory"):
        return folder_paths.get_user_directory()
    base = getattr(folder_paths, "base_path", None)
    if not base:
        base = os.path.dirname(folder_paths.get_input_directory())
    return os.path.join(base, "user", "default")


def vault_path() -> str:
    folder = os.path.join(user_dir(), "atelier_gallery")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "prompts.json")
