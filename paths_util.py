import os

import folder_paths

from .metadata import is_image_name

MAX_LIST = 500


def source_root(source: str, custom_folder: str = "") -> str:
    source = (source or "output").lower()
    if source == "input":
        return os.path.abspath(folder_paths.get_input_directory())
    if source == "temp":
        return os.path.abspath(folder_paths.get_temp_directory())
    if source == "custom":
        folder = (custom_folder or "").strip()
        if not folder:
            raise ValueError("custom 目录为空")
        return os.path.abspath(folder)
    return os.path.abspath(folder_paths.get_output_directory())


def is_within(root: str, path: str) -> bool:
    root = os.path.abspath(root)
    path = os.path.abspath(path)
    try:
        return os.path.commonpath([root, path]) == root
    except ValueError:
        return False


def resolve_image(source: str, filename: str, subfolder: str = "", custom_folder: str = "") -> str:
    filename = os.path.basename((filename or "").replace("\\", "/"))
    if not filename:
        raise ValueError("未选择图片")
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if any(part == ".." for part in sub.split("/") if part):
        raise ValueError("非法子目录")
    root = source_root(source, custom_folder)
    if not os.path.isdir(root):
        raise ValueError(f"目录不存在: {root}")
    path = os.path.join(root, sub, filename) if sub else os.path.join(root, filename)
    path = os.path.abspath(path)
    if not is_within(root, path):
        raise ValueError("路径超出允许目录")
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    return path


def list_images(source: str, subfolder: str = "", custom_folder: str = "", query: str = ""):
    root = source_root(source, custom_folder)
    sub = (subfolder or "").replace("\\", "/").strip("/")
    if any(part == ".." for part in sub.split("/") if part):
        raise ValueError("非法子目录")
    base = os.path.join(root, sub) if sub else root
    base = os.path.abspath(base)
    if not is_within(root, base) and base != root:
        raise ValueError("路径超出允许目录")
    if not os.path.isdir(base):
        return []

    q = (query or "").strip().lower()
    found: list[dict] = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        rel_dir = os.path.relpath(dirpath, root)
        if rel_dir == ".":
            rel_dir = ""
        for name in filenames:
            if name.startswith("."):
                continue
            if not is_image_name(name):
                continue
            if q and q not in name.lower() and q not in rel_dir.replace("\\", "/").lower():
                continue
            full = os.path.join(dirpath, name)
            try:
                st = os.stat(full)
            except OSError:
                continue
            found.append(
                {
                    "filename": name,
                    "subfolder": rel_dir.replace("\\", "/"),
                    "source": source,
                    "mtime": st.st_mtime,
                    "size": st.st_size,
                }
            )
        if len(found) >= MAX_LIST:
            break
    found.sort(key=lambda x: x["mtime"], reverse=True)
    return found[:MAX_LIST]


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
