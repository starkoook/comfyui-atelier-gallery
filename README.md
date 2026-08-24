# Atelier Gallery — ComfyUI 节点

在节点里用画廊浏览本地图片，读取原图提示词 / EXIF，悬停复制，点击预览大图，输出 `IMAGE`、`PROMPT`、`NEGATIVE`。

仓库：https://github.com/starkoook/comfyui-atelier-gallery

## 安装

在 ComfyUI 的 `custom_nodes` 目录执行：

```bash
git clone https://github.com/starkoook/comfyui-atelier-gallery comfyui_atelier_gallery
```

或下载 zip：

https://github.com/starkoook/comfyui-atelier-gallery/archive/refs/heads/main.zip

解压后把文件夹改名为 `comfyui_atelier_gallery`，放到 `ComfyUI/custom_nodes/`。重启 ComfyUI。

不需要额外 pip（使用 ComfyUI 自带的 torch / numpy / Pillow）。

右键 → **Add Node** → **image/atelier** → **Atelier Gallery**

## 用法

- 顶部选择目录：`output` / `input` / `temp`，或填自定义路径后选 `custom`
- 点缩略图：选中为节点输出，并打开大图预览（含原信息）
- 鼠标悬停：复制提示词、存入提示词库
- 把 `IMAGE` 接到 Preview / VAE Encode，把 `PROMPT` 接到 CLIP Text Encode
- Queue Prompt 时加载当前选中的那一张

提示词库存在 ComfyUI 用户目录 `user/atelier_gallery/prompts.json`。

## 读取的元数据

- ComfyUI PNG：`prompt` / `workflow` 中的 CLIP 文本
- Automatic1111：`parameters` 文本块
- JPEG / WebP：EXIF（相机、镜头、ISO、光圈等）

## 节点输出

| 输出 | 类型 | 说明 |
|---|---|---|
| image | IMAGE | 选中的图 |
| mask | MASK | 透明通道，没有则为空 |
| prompt | STRING | 正向提示词 |
| negative | STRING | 负向提示词 |
| metadata | STRING | JSON，含全部原信息 |
