import { app } from "../../scripts/app.js";

const CSS_URL = new URL("./atelier.css", import.meta.url);

function ensureCss() {
  if (document.getElementById("atelier-gallery-css")) return;
  const link = document.createElement("link");
  link.id = "atelier-gallery-css";
  link.rel = "stylesheet";
  link.href = CSS_URL.href;
  document.head.appendChild(link);
}

async function getJSON(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function widget(node, name) {
  return (node.widgets || []).find((w) => w.name === name);
}

function setWidget(node, name, value) {
  const w = widget(node, name);
  if (!w) return;
  w.value = value;
  if (typeof w.callback === "function") w.callback(value);
}

function currentQuery(node) {
  const source = widget(node, "source")?.value || "output";
  const subfolder = widget(node, "subfolder")?.value || "";
  const custom_folder = widget(node, "custom_folder")?.value || "";
  const q = node._atelierQuery || "";
  const params = new URLSearchParams({ source, subfolder, custom_folder, q });
  return { source, subfolder, custom_folder, q, params };
}

function thumbUrl(item, custom_folder) {
  if (item.source === "custom") {
    const p = new URLSearchParams({
      source: "custom",
      filename: item.filename,
      subfolder: item.subfolder || "",
      custom_folder: custom_folder || "",
    });
    return `/atelier/file?${p}`;
  }
  const p = new URLSearchParams({
    filename: item.filename,
    type: item.source || "output",
    subfolder: item.subfolder || "",
  });
  return `/view?${p}`;
}

function toast(text) {
  app.ui?.dialog?.show?.(text);
  console.log("[Atelier Gallery]", text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function closeLightbox() {
  document.getElementById("atelier-lightbox")?.remove();
}

function openLightbox(node, item, meta) {
  closeLightbox();
  const { custom_folder } = currentQuery(node);
  const wrap = document.createElement("div");
  wrap.className = "atg-lb";
  wrap.id = "atelier-lightbox";
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) closeLightbox();
  });
  const prompt = meta.prompt || "";
  const negative = meta.negative || "";
  const params = meta.parameters || {};
  const paramLines = Object.entries(params)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  wrap.innerHTML = `
    <div class="atg-lb-box">
      <img alt="" src="${thumbUrl(item, custom_folder)}" />
      <div class="atg-lb-meta">
        <button class="atg-lb-close" type="button">关闭</button>
        <h3>${item.filename}</h3>
        <p style="font-size:12px;color:#888">${item.subfolder || item.source} · ${meta.software || ""}</p>
        <p style="font-size:12px;margin:8px 0">提示词</p>
        <textarea readonly>${prompt || "（无）"}</textarea>
        <p style="font-size:12px;margin:8px 0">Negative</p>
        <textarea readonly>${negative || "（无）"}</textarea>
        <p style="font-size:12px;margin:8px 0">原信息</p>
        <pre>${paramLines || meta.camera || meta.raw || "—"}</pre>
        <div class="atg-lb-actions">
          <button type="button" data-act="copy">复制提示词</button>
          <button type="button" data-act="save">存入提示词库</button>
        </div>
      </div>
    </div>`;
  wrap.querySelector(".atg-lb-close").onclick = closeLightbox;
  wrap.querySelector('[data-act="copy"]').onclick = async () => {
    if (!prompt) return toast("这张图没有提示词");
    toast((await copyText(prompt)) ? "已复制提示词" : "复制失败");
  };
  wrap.querySelector('[data-act="save"]').onclick = () => savePrompt(item, meta);
  document.body.appendChild(wrap);
}

async function savePrompt(item, meta) {
  if (!meta?.prompt) {
    toast("这张图没有提示词");
    return;
  }
  try {
    await fetch("/atelier/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.filename.replace(/\.[^.]+$/, ""),
        prompt: meta.prompt,
        negative: meta.negative || "",
        filename: item.filename,
        source: item.source,
      }),
    });
    toast("已存入提示词库");
  } catch (err) {
    toast(String(err));
  }
}

async function selectImage(node, item, openPreview) {
  setWidget(node, "filename", item.filename);
  setWidget(node, "subfolder", item.subfolder || "");
  if (item.source) setWidget(node, "source", item.source);
  node._atelierSelected = `${item.subfolder || ""}/${item.filename}`;
  node.setDirtyCanvas(true, true);
  highlight(node);
  let meta = { prompt: "", negative: "" };
  try {
    const q = currentQuery(node);
    const p = new URLSearchParams({
      source: item.source || q.source,
      filename: item.filename,
      subfolder: item.subfolder || "",
      custom_folder: q.custom_folder,
    });
    meta = await getJSON(`/atelier/metadata?${p}`);
  } catch {
    meta = { prompt: "", negative: "" };
  }
  if (openPreview) openLightbox(node, item, meta);
  return meta;
}

function highlight(node) {
  const key = node._atelierSelected;
  node._atelierRoot?.querySelectorAll(".atg-card").forEach((el) => {
    el.classList.toggle("sel", el.dataset.key === key);
  });
}

function renderGrid(node, images) {
  const grid = node._atelierGrid;
  const { custom_folder } = currentQuery(node);
  if (!images.length) {
    grid.innerHTML = `<div class="atg-empty">这个目录里没有图片。生成图会在 output，上传图在 input。</div>`;
    return;
  }
  grid.innerHTML = "";
  for (const item of images) {
    const card = document.createElement("article");
    card.className = "atg-card";
    card.dataset.key = `${item.subfolder || ""}/${item.filename}`;
    card.innerHTML = `
      <img loading="lazy" alt="" src="${thumbUrl(item, custom_folder)}" />
      <div class="name">${item.filename}</div>
      <div class="atg-actions">
        <button type="button" title="复制提示词" data-act="copy">C</button>
        <button type="button" title="存入提示词库" data-act="save">S</button>
      </div>`;
    card.addEventListener("click", (e) => {
      const act = e.target?.dataset?.act;
      if (act === "copy" || act === "save") {
        e.stopPropagation();
        selectImage(node, item, false).then(async (meta) => {
          if (act === "copy") {
            if (!meta.prompt) return toast("没有提示词");
            toast((await copyText(meta.prompt)) ? "已复制提示词" : "复制失败");
          } else {
            savePrompt(item, meta);
          }
        });
        return;
      }
      selectImage(node, item, true);
    });
    grid.appendChild(card);
  }
  highlight(node);
}

async function loadGallery(node) {
  const count = node._atelierRoot?.querySelector(".atg-count");
  try {
    const q = currentQuery(node);
    const data = await getJSON(`/atelier/gallery?${q.params}`);
    const images = data.images || [];
    if (count) count.textContent = `${images.length} 张`;
    renderGrid(node, images);
  } catch (err) {
    if (count) count.textContent = "";
    node._atelierGrid.innerHTML = `<div class="atg-empty">${err.message || err}</div>`;
  }
}

async function loadVault(node) {
  const box = node._atelierVault;
  try {
    const data = await getJSON("/atelier/prompts");
    const items = data.prompts || [];
    if (!items.length) {
      box.innerHTML = `<div class="atg-empty">还没有保存的提示词。悬停卡片点 S，或在大图里点「存入提示词库」。</div>`;
      return;
    }
    box.innerHTML = items
      .map(
        (p) => `
      <div class="atg-vault-item" data-id="${p.id}">
        <header>
          <strong>${p.title || "untitled"}</strong>
          <span>
            <button type="button" data-act="copy">复制</button>
            <button type="button" data-act="del">删</button>
          </span>
        </header>
        <p>${p.prompt}</p>
      </div>`
      )
      .join("");
    box.querySelectorAll(".atg-vault-item").forEach((el, i) => {
      const item = items[i];
      el.querySelector('[data-act="copy"]').onclick = async () => {
        toast((await copyText(item.prompt)) ? "已复制提示词" : "复制失败");
      };
      el.querySelector('[data-act="del"]').onclick = async () => {
        await fetch(`/atelier/prompts?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
        loadVault(node);
      };
    });
  } catch (err) {
    box.innerHTML = `<div class="atg-empty">${err.message || err}</div>`;
  }
}

function showTab(node, name) {
  node._atelierGrid.style.display = name === "grid" ? "grid" : "none";
  node._atelierVault.style.display = name === "vault" ? "block" : "none";
  node._atelierRoot.querySelectorAll(".atg-tab").forEach((b) => {
    b.classList.toggle("on", b.dataset.tab === name);
  });
  if (name === "vault") loadVault(node);
}

function buildWidget(node) {
  ensureCss();
  const root = document.createElement("div");
  root.className = "atg-root";
  root.innerHTML = `
    <div class="atg-bar">
      <button class="atg-tab on" data-tab="grid" type="button">图库</button>
      <button class="atg-tab" data-tab="vault" type="button">提示词</button>
      <input type="search" placeholder="搜索文件名" />
      <button type="button" class="primary" data-act="refresh">刷新</button>
      <span class="atg-count"></span>
    </div>
    <div class="atg-grid"></div>
    <div class="atg-vault" style="display:none"></div>`;
  node._atelierRoot = root;
  node._atelierGrid = root.querySelector(".atg-grid");
  node._atelierVault = root.querySelector(".atg-vault");
  const search = root.querySelector("input[type=search]");
  search.addEventListener("input", () => {
    node._atelierQuery = search.value;
    loadGallery(node);
  });
  root.querySelector('[data-act="refresh"]').onclick = () => loadGallery(node);
  root.querySelectorAll(".atg-tab").forEach((b) => {
    b.onclick = () => showTab(node, b.dataset.tab);
  });

  const dom = node.addDOMWidget("atelier_gallery", "ATELIER_GALLERY", root, {
    serialize: false,
    hideOnZoom: false,
  });
  dom.computeSize = (width) => [width || 420, 430];

  for (const name of ["source", "custom_folder", "subfolder"]) {
    const w = widget(node, name);
    if (!w) continue;
    const prev = w.callback;
    w.callback = function () {
      if (prev) prev.apply(this, arguments);
      loadGallery(node);
    };
  }

  const filename = widget(node, "filename")?.value;
  const sub = widget(node, "subfolder")?.value || "";
  if (filename) node._atelierSelected = `${sub}/${filename}`;

  if (!node.size || node.size[0] < 420) node.setSize([Math.max(node.size?.[0] || 0, 460), Math.max(node.size?.[1] || 0, 620)]);
  loadGallery(node);
}

app.registerExtension({
  name: "atelier.gallery",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "AtelierGallery") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      buildWidget(this);
      return r;
    };
    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      closeLightbox();
      return onRemoved?.apply(this, arguments);
    };
  },
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});
