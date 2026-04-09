/**
 * FashionVision - Upload Module
 * Handles file selection, drag-and-drop, preview, and calling /api/upload.
 * Exports the current upload result for use by the schedule module.
 */

import { getToken, clearSession } from "./auth.js";
import { showToast, showLoading, hideLoading, updateLoadingText } from "./app.js";
import GravityCloset from "./gravity_closet.js";

const API_BASE = "";

// Module state
let currentFile = null;
export let currentAnalysis = null;
export let currentImageUrl = "";
export let currentUploadId = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const dropZone = () => document.getElementById("drop-zone");
const fileInput = () => document.getElementById("file-input");
const previewWrap = () => document.getElementById("upload-preview");
const previewImg = () => document.getElementById("preview-img");
const clearBtn = () => document.getElementById("clear-image-btn");
const analyzeBtn = () => document.getElementById("analyze-btn");
const uploadAlert = () => document.getElementById("upload-alert");
const resultSection = () => document.getElementById("result-section");
const placeholder = () => document.getElementById("result-placeholder");

// ─── Alert helpers ────────────────────────────────────────────────────────────

function showUploadAlert(msg) {
  const el = uploadAlert();
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
}

function hideUploadAlert() {
  const el = uploadAlert();
  if (el) el.classList.remove("visible");
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = previewImg();
    const wrap = previewWrap();
    const zone = dropZone();
    if (img) img.src = e.target.result;
    if (wrap) wrap.style.display = "block";
    if (zone) zone.style.display = "none";
  };
  reader.readAsDataURL(file);
  analyzeBtn().disabled = false;
}

function clearPreview() {
  currentFile = null;
  const img = previewImg();
  const wrap = previewWrap();
  const zone = dropZone();
  const inp = fileInput();
  if (img) img.src = "";
  if (wrap) wrap.style.display = "none";
  if (zone) zone.style.display = "";
  if (inp) inp.value = "";
  analyzeBtn().disabled = true;
  hideUploadAlert();
  hideResults();
}

function hideResults() {
  const rs = resultSection();
  const ph = placeholder();
  if (rs) rs.classList.remove("visible");
  if (ph) ph.style.display = "";
  currentAnalysis = null;
  currentImageUrl = "";
  currentUploadId = null;

  // Also hide schedule section
  const ss = document.getElementById("schedule-section");
  if (ss) ss.classList.remove("visible");
}

// ─── Render results ───────────────────────────────────────────────────────────

function renderResults(data) {
  const rs = resultSection();
  const ph = placeholder();
  if (rs) {
    rs.classList.remove("visible");
    void rs.offsetWidth; // Trigger reflow to restart CSS animation cleanly
    rs.classList.add("visible");
  }
  if (ph) ph.style.display = "none";

  const { analysis, content } = data;

  // Attribute chips
  const grid = document.getElementById("analysis-grid");
  if (grid) {
    const attrs = [
      { label: "Confidence", value: analysis.confidence || "AI" },
      { label: "Type", value: analysis.clothing_type },
      { label: "Color", value: analysis.color },
      { label: "Pattern", value: analysis.pattern },
      { label: "Style", value: analysis.style },
      { label: "Season", value: analysis.season },
      { label: "Occasion", value: analysis.occasion },
      { label: "Gender", value: analysis.gender },
      { label: "Fit", value: analysis.fit },
      { label: "Trend", value: analysis.trend }
    ];
    grid.innerHTML = attrs
      .filter(a => a.value && String(a.value).trim() !== "")
      .map(a => `
        <div class="attr-chip">
          <div class="attr-chip__label">${a.label}</div>
          <div class="attr-chip__value">${a.value || "—"}</div>
        </div>`)
      .join("");
  }

  // Title
  const titleEl = document.getElementById("result-title");
  if (titleEl) titleEl.textContent = content.title || "";

  // Description
  const descEl = document.getElementById("result-description");
  if (descEl) descEl.textContent = content.description || "";

  // Hashtags
  const hashEl = document.getElementById("result-hashtags");
  if (hashEl) {
    hashEl.innerHTML = (content.hashtags || [])
      .map(h => `<span class="hashtag-pill">${h}</span>`)
      .join("");
  }

  // Boards
  const boardEl = document.getElementById("result-boards");
  if (boardEl) {
    boardEl.innerHTML = (content.suggested_boards || [])
      .map(b => `<span class="board-pill">${b}</span>`)
      .join("");
  }
}

// ─── Upload & Analyze ─────────────────────────────────────────────────────────

async function analyzeImage() {
  if (!currentFile) return;

  // STEP 1: Wait for token (prevent race condition)
  let token = getToken();
  let retries = 5;
  while (!token && retries > 0) {
    await new Promise(r => setTimeout(r, 300));
    token = getToken();
    retries--;
  }

  // STEP 3: Block if no token
  if (!token) {
    window.location.href = "/login";
    return;
  }

  hideUploadAlert();
  showLoading("Uploading...");

  // Multi-stage loading
  const stages = ["Analyzing...", "Generating..."];
  let stageIdx = 0;
  const loadingInterval = setInterval(() => {
    if (stageIdx < stages.length) {
      updateLoadingText(stages[stageIdx]);
      stageIdx++;
    }
  }, 2500);

  const formData = new FormData();
  formData.append("file", currentFile);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s max

  try {
    // STEP 2: Attach token to request
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(loadingInterval);

    // STEP 4: Handle 401 response explicitly
    if (res.status === 401) {
      clearSession();
      window.location.href = "/login";
      return;
    }

    const data = await res.json();

    if (res.ok) {
      currentAnalysis = data.analysis;
      currentImageUrl  = data.image_url || "";
      currentUploadId  = data.id || null;
      renderResults(data);
      prefillScheduleForm(data);
      showToast("Analysis complete!", "success");

      // ─── Feed into Gravity Closet ────────────────────────────
      if (data.image_url) {
        GravityCloset.addItem({
          id:           data.id,
          image_url:    data.image_url,
          title:        data.content?.title        || "",
          description:  data.content?.description  || "",
          hashtags:     data.content?.hashtags     || [],
          clothing_type: data.analysis?.clothing_type || "",
          color:        data.analysis?.color        || "",
          pattern:      data.analysis?.pattern      || "",
          style:        data.analysis?.style        || "",
          season:       data.analysis?.season       || "",
        });
      }
      // ─────────────────────────────────────────────────────────
    } else {
      const errorMsg = data.error || "Fashion items only!";
      
      // Shake animation
      const zone = dropZone();
      if (zone) {
        zone.classList.add("animate-shake");
        setTimeout(() => zone.classList.remove("animate-shake"), 500);
      }

      showUploadAlert(errorMsg);
      showToast(errorMsg, "error");
    }
  } catch (err) {
    clearInterval(loadingInterval);
    
    // Also shake on network error
    const zone = dropZone();
    if (zone) {
      zone.classList.add("animate-shake");
      setTimeout(() => zone.classList.remove("animate-shake"), 500);
    }

    if (err.name === 'AbortError') {
      showUploadAlert("Request timed out. Please try again.");
      showToast("Timeout. Try again.", "error");
    } else {
      showUploadAlert("Network error. Please check your connection and try again.");
      showToast("Network error.", "error");
    }
  } finally {
    clearTimeout(timeoutId);
    hideLoading();
  }
}

// ─── Copy buttons ─────────────────────────────────────────────────────────────

function initCopyButtons() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-btn");
    if (!btn) return;
    const targetId = btn.dataset.copy;
    const el = document.getElementById(targetId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      const orig = btn.textContent;
      btn.textContent = "✅";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}

// ─── Prefill schedule form ────────────────────────────────────────────────────

function prefillScheduleForm(data) {
  const { content } = data;
  const sch = (id) => document.getElementById(id);

  if (sch("sch-title")) sch("sch-title").value = content.title || "";
  if (sch("sch-description")) sch("sch-description").value = content.description || "";
  if (sch("sch-hashtags")) sch("sch-hashtags").value = (content.hashtags || []).join(" ");
  if (sch("sch-board")) sch("sch-board").value = (content.suggested_boards || [])[0] || "";
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initUpload() {
  const zone = dropZone();
  const input = fileInput();
  const clear = clearBtn();
  const btn = analyzeBtn();
  if (!zone || !input || !btn) return;

  // File input change
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) { currentFile = file; showPreview(file); }
  });

  // Drag and drop
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) { currentFile = file; showPreview(file); }
  });

  // Keyboard a11y
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") input.click();
  });

  // Clear/remove image
  if (clear) clear.addEventListener("click", clearPreview);

  // Analyze button
  btn.addEventListener("click", analyzeImage);

  initCopyButtons();
}