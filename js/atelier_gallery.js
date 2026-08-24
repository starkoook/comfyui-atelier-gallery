import { app } from "../../scripts/app.js";

const CSS_URL = new URL("./atelier.css", import.meta.url);

const TIP_COPY = "\u590d\u5236\u63d0\u793a\u8bcd";
const TIP_SAVE = "\u5b58\u5165\u63d0\u793a\u8bcd\u5e93";
const TIP_COPY_NEG = "\u590d\u5236\u8d1f\u5411";

const ICO_COPY =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5.2" y="5.2" width="8" height="8" rx="1.6"/><path d="M3.4 10.2V4.2A1.6 1.6 0 0 1 5 2.6h6"/></svg>';
const ICO_SAVE =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 2.6h8v11.2L8 11.2 4 13.8V2.6z"/></svg>';
const ICO_FOLDER =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h4.1l1.6 1.8H18a2.5 2.5 0 0 1 2.5 2.5v9.2A2.5 2.5 0 0 1 18 20.5H6A2.5 2.5 0 0 1 3.5 18V6.5z"/></svg>';
const ICO_UP =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7.2 8 2.8 13 7.2"/><path d="M8 3.4v9.4"/></svg>';
const ICO_GO =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 8h10"/><path d="M9.2 4.2 13 8l-3.8 3.8"/></svg>';



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

function folderOf(node) {
  return widget(node, "folder")?.value || node._atelierPath || "";
}

function thumbUrl(folder, filename) {
  const p = new URLSearchParams({ folder: folder || "", filename: filename || "" });
  return `/atelier/file?${p}`;
}

function toast(text) {
  if (app.extensionManager?.toast) {
    app.extensionManager.toast.add({ severity: "info", summary: "Atelier", detail: String(text), life: 2200 });
    return;
  }
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

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function openLightbox(node, item, meta) {
  closeLightbox();
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
      <img alt="" src="${esc(thumbUrl(item.folder, item.filename))}" />
      <div class="atg-lb-meta">
        <button class="atg-lb-close" type="button">Close</button>
        <h3>${esc(item.filename)}</h3>
        <p style="font-size:12px;color:#888">${esc(item.folder || "")}</p>
        <p style="font-size:12px;margin:8px 0">Prompt</p>
        <textarea readonly>${esc(prompt || "(none)")}</textarea>
        <p style="font-size:12px;margin:8px 0">Negative</p>
        <textarea readonly>${esc(negative || "(none)")}</textarea>
        <p style="font-size:12px;margin:8px 0">Metadata</p>
        <pre>${esc(paramLines || meta.camera || meta.raw || "-")}</pre>
        <div class="atg-lb-actions">
          <button type="button" data-act="copy-p">Copy prompt</button>
          <button type="button" data-act="copy-n">Copy negative</button>
          <button type="button" data-act="save">Save to vault</button>
        </div>
      </div>
    </div>`;
  wrap.querySelector(".atg-lb-close").onclick = closeLightbox;
  wrap.querySelector('[data-act="copy-p"]').onclick = async () => {
    if (prompt) await copyText(prompt);
  };
  wrap.querySelector('[data-act="copy-n"]').onclick = async () => {
    if (negative) await copyText(negative);
  };
  wrap.querySelector('[data-act="save"]').onclick = () => savePrompt(item, meta);
  document.body.appendChild(wrap);
}

async function savePrompt(item, meta) {
  if (!meta?.prompt && !meta?.negative) {
    toast("Nothing to save");
    return;
  }
  try {
    await fetch("/atelier/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.filename.replace(/\.[^.]+$/, ""),
        prompt: meta.prompt || "",
        negative: meta.negative || "",
        filename: item.filename,
      }),
    });
    toast("Saved to vault");
  } catch (err) {
    toast(String(err));
  }
}

async function selectImage(node, item, openPreview) {
  setWidget(node, "folder", item.folder);
  setWidget(node, "filename", item.filename);
  node._atelierSelected = item.filename;
  node.setDirtyCanvas(true, true);
  highlight(node);
  let meta = { prompt: "", negative: "" };
  try {
    const p = new URLSearchParams({ folder: item.folder, filename: item.filename });
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

function renderBrowse(node, data) {
  const grid = node._atelierGrid;
  const folders = data.folders || [];
  const images = data.images || [];
  node._atelierParent = data.parent;
  if (data.cwd) {
    node._atelierPath = data.cwd;
    const pathInput = node._atelierRoot.querySelector(".atg-path");
    if (pathInput && pathInput !== document.activeElement) pathInput.value = data.cwd;
    setWidget(node, "folder", data.cwd);
  }
  const count = node._atelierRoot.querySelector(".atg-count");
  if (count) count.textContent = `${folders.length} / ${images.length}`;

  if (!folders.length && !images.length) {
    grid.innerHTML = `<div class="atg-empty">${data.cwd ? "Empty folder" : "Pick a drive or folder"}</div>`;
    return;
  }
  grid.innerHTML = "";
  for (const folder of folders) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "atg-folder";
    btn.innerHTML = `${ICO_FOLDER}<span class="lab">${esc(folder.name)}</span>`;
    btn.onclick = () => goPath(node, folder.path);
    grid.appendChild(btn);
  }
  for (const item of images) {
    const card = document.createElement("article");
    card.className = "atg-card";
    card.dataset.key = item.filename;
    card.innerHTML = `
      <img loading="lazy" alt="" src="${esc(thumbUrl(item.folder, item.filename))}" />
      <div class="name">${esc(item.filename)}</div>
      <div class="atg-actions">
        <button type="button" class="atg-icon" data-act="copy" data-tip="${TIP_COPY}" aria-label="${TIP_COPY}">${ICO_COPY}</button>
        <button type="button" class="atg-icon" data-act="save" data-tip="${TIP_SAVE}" aria-label="${TIP_SAVE}">${ICO_SAVE}</button>
      </div>`;
    card.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset?.act;
      if (act === "copy" || act === "save") {
        e.stopPropagation();
        selectImage(node, item, false).then(async (meta) => {
          if (act === "copy") {
            const text = meta.prompt || meta.negative || "";
            if (text) await copyText(text);
          } else savePrompt(item, meta);
        });
        return;
      }
      selectImage(node, item, true);
    });
    grid.appendChild(card);
  }
  highlight(node);
}

async function goPath(node, path) {
  node._atelierPath = path || "";
  const q = node._atelierQuery || "";
  const params = new URLSearchParams({ path: path || "", q });
  try {
    const data = await getJSON(`/atelier/browse?${params}`);
    renderBrowse(node, data);
  } catch (err) {
    node._atelierGrid.innerHTML = `<div class="atg-empty">${esc(err.message || err)}</div>`;
  }
}

async function loadVault(node) {
  const box = node._atelierVault;
  try {
    const data = await getJSON("/atelier/prompts");
    const items = data.prompts || [];
    if (!items.length) {
      box.innerHTML = `<div class="atg-empty">Vault is empty. Save from an image preview.</div>`;
      return;
    }
    box.innerHTML = items
      .map(
        (p) => `
      <div class="atg-vault-item" data-id="${esc(p.id)}">
        <header>
          <strong>${esc(p.title || "untitled")}</strong>
          <span>
            <button type="button" data-act="copy">Copy</button>
            <button type="button" data-act="del">Del</button>
          </span>
        </header>
        <p>${esc(p.prompt || p.negative || "")}</p>
      </div>`
      )
      .join("");
    box.querySelectorAll(".atg-vault-item").forEach((el, i) => {
      const item = items[i];
      el.querySelector('[data-act="copy"]').onclick = async () => {
        const text = item.prompt || item.negative || "";
        if (text) await copyText(text);
      };
      el.querySelector('[data-act="del"]').onclick = async () => {
        await fetch(`/atelier/prompts?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
        loadVault(node);
      };
    });
  } catch (err) {
    box.innerHTML = `<div class="atg-empty">${esc(err.message || err)}</div>`;
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

function hideNativeWidgets(node) {
  for (const name of ["folder", "filename"]) {
    const w = widget(node, name);
    if (!w) continue;
    w.hidden = true;
    w.computeSize = () => [0, -4];
  }
}

function buildWidget(node) {
  ensureCss();
  hideNativeWidgets(node);
  const root = document.createElement("div");
  root.className = "atg-root";
  root.innerHTML = `
    <div class="atg-chrome">
      <div class="atg-row atg-row-top">
        <div class="atg-tabs">
          <button class="atg-tab on" data-tab="grid" type="button">Files</button>
          <button class="atg-tab" data-tab="vault" type="button">Prompts</button>
        </div>
        <span class="atg-count"></span>
      </div>
      <div class="atg-row atg-row-path">
        <button class="atg-tool" type="button" data-act="up" data-tip="Up">${ICO_UP}</button>
        <div class="atg-path-wrap">
          <input class="atg-path" type="text" placeholder="D:\\pics" spellcheck="false" />
        </div>
        <button class="atg-tool primary" type="button" data-act="go" data-tip="Open">${ICO_GO}</button>
        <input class="atg-search" type="search" placeholder="Filter" />
      </div>
    </div>
    <div class="atg-grid"></div>
    <div class="atg-vault" style="display:none"></div>`;
  node._atelierRoot = root;
  node._atelierGrid = root.querySelector(".atg-grid");
  node._atelierVault = root.querySelector(".atg-vault");
  const pathInput = root.querySelector(".atg-path");
  const search = root.querySelector("input.atg-search");
  search.addEventListener("input", () => {
    node._atelierQuery = search.value;
    goPath(node, node._atelierPath || pathInput.value);
  });
  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") goPath(node, pathInput.value.trim());
  });
  root.querySelector('[data-act="go"]').onclick = () => goPath(node, pathInput.value.trim());
  root.querySelector('[data-act="up"]').onclick = () => {
    if (node._atelierParent == null) goPath(node, "");
    else goPath(node, node._atelierParent);
  };
  root.querySelectorAll(".atg-tab").forEach((b) => {
    b.onclick = () => showTab(node, b.dataset.tab);
  });

  try {
    const dom = node.addDOMWidget("atelier_gallery", "div", root, {
      serialize: false,
      hideOnZoom: false,
    });
    if (dom) {
      dom.computeSize = (width) => [Math.max(width || 0, 380), 448];
    }
  } catch (err) {
    console.error("[Atelier Gallery] addDOMWidget failed", err);
    node.addWidget("text", "atelier_error", "UI failed to mount");
  }

  const start = widget(node, "folder")?.value || "";
  if (start) pathInput.value = start;
  node.setSize([Math.max(node.size?.[0] || 0, 460), Math.max(node.size?.[1] || 0, 560)]);
  goPath(node, start);
}

app.registerExtension({
  name: "atelier.gallery",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "AtelierGallery") return;
    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      try {
        buildWidget(this);
      } catch (err) {
        console.error(err);
      }
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
