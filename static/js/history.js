import { fetchWithAuth } from "./auth.js";
import { showToast } from "./app.js";

const API_BASE = "";

// ─── CSS Injection (Staggered Entrance & Hover Zoom) ───────────────────────────
function _injectHistoryCSS() {
  if (document.getElementById("history-fx-css")) return;
  const style = document.createElement("style");
  style.id = "history-fx-css";
  style.textContent = `
    .history-card { 
      opacity: 0; transform: translateY(20px); 
      animation: cardEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      overflow: hidden; position: relative;
    }
    @keyframes cardEntrance {
      to { opacity: 1; transform: translateY(0); }
    }
    .history-card__image-container { position: relative; overflow: hidden; height: 180px; }
    .history-card__image { 
      width: 100%; height: 100%; object-fit: cover; 
      transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .history-card:hover .history-card__image { transform: scale(1.1); }
    .history-card__overlay {
        position: absolute; inset: 0; background: rgba(0,0,0,0.4);
        opacity: 0; transition: opacity 0.4s ease;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    }
    .history-card:hover .history-card__overlay { opacity: 1; }
    .history-card__cta {
        color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.2em;
        padding: 10px 20px; border: 1px solid rgba(255,255,255,0.4);
        transform: translateY(10px); transition: 0.4s ease;
    }
    .history-card:hover .history-card__cta { transform: translateY(0); }
  `;
  document.head.appendChild(style);
}
_injectHistoryCSS();

// Date formatting helper
function formatDate(isoStr) {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short",
  });
}

// Status badge helper
function statusBadge(status) {
  const cls = status === "published" ? "badge--success" : "badge--pending";
  return `<span class="badge ${cls}">${status || "pending"}</span>`;
}

// 1. Render Uploads (Staggered)
function renderUploads(uploads) {
  const grid = document.getElementById("uploads-grid");
  const empty = document.getElementById("uploads-empty");
  if (!grid) return;

  const fashionOnly = (uploads || []).filter(u => {
    const type = (u.clothing_type || "").toLowerCase();
    const junkWords = ["animal", "dog", "cat", "bird", "food", "building", "car"];
    return !junkWords.some(word => type.includes(word));
  });

  if (fashionOnly.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  grid.innerHTML = fashionOnly.map((u, idx) => `
        <div class="history-card" style="animation-delay: ${idx * 60}ms">
            <div class="history-card__image-container">
                ${u.image_url
      ? `<img class="history-card__image" src="${u.image_url}" alt="${u.clothing_type}" loading="lazy" />`
      : `<div class="history-card__image-placeholder">👗</div>`
    }
                <div class="history-card__overlay"><span class="history-card__cta">DETAILS</span></div>
            </div>
            <div class="history-card__body">
                <div class="history-card__type">Upload</div>
                <p class="history-card__title">${u.title || u.clothing_type || "Untitled Outfit"}</p>
                <p class="history-card__meta">${formatDate(u.created_at)}</p>
                <div class="history-card__badges">
                    ${u.clothing_type ? `<span class="badge badge--default">${u.clothing_type}</span>` : ""}
                    ${u.color ? `<span class="badge badge--accent">${u.color}</span>` : ""}
                    ${u.season ? `<span class="badge badge--default">${u.season}</span>` : ""}
                </div>
            </div>

        </div>
    `).join("");
}

// 2. Render Scheduled Content
function renderScheduled(scheduled) {
  const grid = document.getElementById("scheduled-grid");
  const empty = document.getElementById("scheduled-empty");
  if (!grid) return;

  if (!scheduled || scheduled.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  grid.innerHTML = scheduled.map((s, idx) => `
        <div class="history-card" style="animation-delay: ${idx * 60}ms">
            <div class="history-card__image-container">
                ${s.image_url
      ? `<img class="history-card__image" src="${s.image_url}" alt="${s.title}" loading="lazy" />`
      : `<div class="history-card__image-placeholder">📅</div>`
    }
                <div class="history-card__overlay"><span class="history-card__cta">SCHEDULED</span></div>
            </div>
            <div class="history-card__body">
                <div class="history-card__type">Scheduled</div>
                <p class="history-card__title">${s.title || "Untitled Post"}</p>
                <p class="history-card__meta">Date: ${formatDate(s.scheduled_time)}</p>
                <div class="history-card__badges">
                    ${statusBadge(s.status)}
                    ${s.board_id ? `<span class="badge badge--default">Board: ${s.board_id}</span>` : ""}
                </div>
            </div>

        </div>
    `).join("");
}

// --- API LOAD LOGIC (SAFE) ---
export async function loadHistory() {
  try {
    const url = `${API_BASE}/api/history?t=${Date.now()}`;
    const res = await fetchWithAuth(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    const data = await res.json();
    if (res.ok) {
      renderUploads(data.history || []);
      renderScheduled(data.scheduled || []);
    } else {
      showToast(data.error || "Sync failed.", "error");
    }
  } catch (err) {
    showToast("Server unreachable.", "error");
  }
}

export function initHistory() {
  const historyTabBtns = document.querySelectorAll("[data-htab]");
  historyTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      historyTabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const targetPanelId = btn.dataset.htab;
      document.querySelectorAll(".history-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === targetPanelId);
      });
    });
  });

  const refreshBtn = document.getElementById("refresh-history-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      await loadHistory();
      refreshBtn.disabled = false;
    });
  }
  window.addEventListener("focus", loadHistory);
}