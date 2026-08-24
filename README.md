# Atelier Gallery — ComfyUI node

Browse local disks and folders in the node, read prompt / EXIF, copy prompt or negative, output `IMAGE` + `PROMPT` + `NEGATIVE`.

Repo: https://github.com/starkoook/comfyui-atelier-gallery

## Install

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/starkoook/comfyui-atelier-gallery comfyui_atelier_gallery
```

Restart ComfyUI. Right click → **Add Node** → **image/atelier** → **Atelier Gallery**

Delete the old node from the graph and add it again after updating (widget names changed).

## Browse local files

- Node opens at drives / output / input / home
- Click a folder to enter, **Up** to go back
- Paste a path (`D:\pics`) and **Open**
- Click a thumbnail to preview and set node output
- Hover **C** copy prompt, **S** save to vault
- Preview has **Copy prompt** and **Copy negative** separately

## Outputs

| name | type | note |
|---|---|---|
| image | IMAGE | selected file |
| mask | MASK | alpha, or empty |
| prompt | STRING | positive |
| negative | STRING | negative |
| metadata | STRING | JSON |
