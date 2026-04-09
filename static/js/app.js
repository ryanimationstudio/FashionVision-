/**
 * FashionVision - App Orchestrator
 * Initializes all modules, handles page tabs, navbar, session guard, and logout.
 * Exports shared utilities (showToast, showLoading, hideLoading) for other modules.
 */

import { getToken, getUser, clearSession, isAuthenticated, waitForToken } from "./auth.js";
import { initUpload } from "./upload.js";
import { initSchedule } from "./schedule.js";
import { initHistory, loadHistory } from "./history.js";

const API_BASE = "";

// ─── CSS Injection ───────────────────────────────────────────────────────────
function _injectAppCSS() {
  if (document.getElementById("app-fx-css")) return;
  const style = document.createElement("style");
  style.id = "app-fx-css";
  style.textContent = `
    /* 💨 SLIDING TABS FX */
    .tab-panel { display: none; width: 100%; }
    .tab-panel.active { display: block; animation: portalSlide 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes portalSlide {
      from { opacity: 0; transform: translateX(30px); filter: blur(10px); }
      to { opacity: 1; transform: translateX(0); filter: blur(0); }
    }

    /* 🟢 LIVE SYNC PULSE */
    .sync-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #10B981;
      display: inline-block; margin-right: 12px;
      box-shadow: 0 0 10px #10B981;
      animation: syncPulse 2s infinite ease-in-out;
    }
    @keyframes syncPulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.5; box-shadow: 0 0 20px #10B981; }
      100% { transform: scale(1); opacity: 1; }
    }
    .nav-user-wrap { display: flex; align-items: center; }
  `;
  document.head.appendChild(style);
}
_injectAppCSS();

// ─── Toast Notifications ──────────────────────────────────────────────────────


export function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  // Initial hidden state (CSS transitions ke liye zaroori hai)
  toast.style.opacity = "0";
  toast.style.transform = "translateX(50px)";
  toast.style.transition = "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)";

  toast.innerHTML = `
    <span class="toast__icon">${type === 'error' ? '⚠️' : '✨'}</span>
    <span class="toast__msg">${msg}</span>
  `;

  container.appendChild(toast);

  // Magic: Force reflow taaki animation smooth chale
  toast.offsetHeight;

  // Show state
  toast.style.opacity = "1";
  toast.style.transform = "translateX(0)";

  // Remove logic
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────

export function showLoading(msg = "Processing…") {
  const overlay = document.getElementById("loading-overlay");
  const msgEl = document.getElementById("loading-msg");
  if (overlay) overlay.classList.add("visible");
  if (msgEl) msgEl.textContent = msg;
}

export function updateLoadingText(msg) {
  const msgEl = document.getElementById("loading-msg");
  if (msgEl) msgEl.textContent = msg;
}

export function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.classList.remove("visible");
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function initNavbar() {
  const user = getUser();
  const emailEl = document.getElementById("nav-user-email");
  if (emailEl && user?.email) {
    emailEl.textContent = user.email;

    // 🟢 ADD LIVE SYNC DOT
    const dot = document.createElement("span");
    dot.className = "sync-dot";
    dot.title = "Verified AI Connection";
    emailEl.parentElement.prepend(dot);
    emailEl.parentElement.classList.add("nav-user-wrap");
  }


  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const token = getToken();
      // Fire-and-forget server logout
      if (token) {
        fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => { });
      }
      clearSession();
      window.location.href = "/login";
    });
  }
}

// ─── Main Page Tabs ───────────────────────────────────────────────────────────

function initPageTabs() {
  const tabBtns = document.querySelectorAll("#page-tabs .tab");
  const tabPanels = {
    "analyze-panel": document.getElementById("analyze-panel"),
    "history-panel": document.getElementById("history-panel"),
  };
  let historyLoaded = false;

  tabBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.classList.contains("active")) return;

      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const targetId = btn.dataset.tab;
      Object.entries(tabPanels).forEach(([id, panel]) => {
        if (panel) {
          panel.classList.toggle("active", id === targetId);
          if (id === targetId) panel.classList.add("tab-panel"); // Ensure animation class
        }
      });


      // Lazy-load history on first visit
      if (targetId === "history-panel" && !historyLoaded) {
        historyLoaded = true;
        await loadHistory();
      }
    });
  });

  // Handle deep-link to /history or #history-tab
  if (window.location.pathname === "/history" || window.location.hash === "#history-tab") {
    const historyBtn = document.querySelector('[data-tab="history-panel"]');
    if (historyBtn) historyBtn.click();
  }

  // Nav links for history
  const navHistory = document.getElementById("nav-history");
  if (navHistory) {
    navHistory.addEventListener("click", (e) => {
      e.preventDefault();
      const historyBtn = document.querySelector('[data-tab="history-panel"]');
      if (historyBtn) historyBtn.click();
    });
  }
}

// ─── Session Guard ────────────────────────────────────────────────────────────

async function guardSession() {
  const token = await waitForToken(5, 300);
  if (!token) {
    window.location.href = "/login";
    return false;
  }

  // Verify token is actually valid on backend
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok || res.status === 401) {
      clearSession();
      window.location.href = "/login";
      return false;
    }
  } catch (err) {
    // If network fails, we'll let them stay in UI, but API calls will fail gracefully
    console.error("Network error during session validation");
  }

  return true;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Only guard and init on index (not login/signup pages)
  const isAuthPage = document.getElementById("login-form") || document.getElementById("signup-form");
  if (isAuthPage) return;

  const sessionValid = await guardSession();
  if (!sessionValid) return;

  initNavbar();
  initPageTabs();
  initUpload();
  initSchedule();
  initHistory();
});

// ─── Dynamic Closet Removal Engine ───────────────────────────────────────────
document.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".delete-btn");
  if (!deleteBtn) return;

  const item = deleteBtn.closest(".closet-item");
  if (!item) return;

  // Trigger CSS out-animation
  item.classList.add("removing");

  // Await the standard 300ms defined in the CSS layout to strip visually
  setTimeout(() => {
    item.remove();
  }, 300);
});
