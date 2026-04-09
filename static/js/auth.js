/**
 * FashionVision - Auth Module
 * Handles login and signup form submission via backend API.
 * Token is stored in localStorage for use by other modules.
 */

const API_BASE = "";  // Same-origin in production

// ─── CSS Injection ───────────────────────────────────────────────────────────
function _injectAuthCSS() {
  if (document.getElementById("auth-fx-css")) return;
  const style = document.createElement("style");
  style.id = "auth-fx-css";
  style.textContent = `
    .success-burst {
      position: fixed; inset: 0; z-index: 10000; pointer-events: none;
      background: radial-gradient(circle at center, rgba(236,72,153,0.4) 0%, transparent 70%);
      opacity: 0; transition: opacity 0.6s ease;
    }
    .burst-active { opacity: 1; }
    .welcome-back-msg {
      font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: #EC4899;
      margin-bottom: 15px; text-transform: uppercase; text-align: center;
      animation: fadeInDown 0.5s ease;
    }
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
_injectAuthCSS();

// ─── Utilities ───────────────────────────────────────────────────────────────


function showAlert(id, message, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert ${type} visible`;
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = "alert";
}

function setLoading(btnId, loading, originalText = "") {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Please wait…`
    : originalText;
}

function _triggerSuccessBurst() {
  const burst = document.createElement("div");
  burst.className = "success-burst";
  document.body.appendChild(burst);
  requestAnimationFrame(() => burst.classList.add("burst-active"));
  setTimeout(() => burst.remove(), 800);
}


// ─── Session helpers ──────────────────────────────────────────────────────────

export function saveSession(token, user) {
  localStorage.setItem("fv_token", token);
  localStorage.setItem("fv_user", JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem("fv_token") || "";
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("fv_user") || "null");
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("fv_token");
  localStorage.removeItem("fv_user");
  sessionStorage.clear();
}

export async function handleLogout() {
  try {
    const token = getToken();
    if (token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      }).catch(() => { }); // Silent fail: local clear is priority
    }
  } catch (e) { }

  clearSession();
  window.location.replace("/login");
}

export function setupGlobalLogout() {
  const logoutBtn = document.getElementById("nav-logout");
  if (logoutBtn) {
    // Remove any existing listeners by cloning (if needed) - but for now just add
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
    });
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export async function waitForToken(retries = 5, delayMs = 300) {
  for (let i = 0; i < retries; i++) {
    const token = getToken();
    if (token) return token;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

export async function fetchWithAuth(url, options = {}) {
  const token = await waitForToken();
  if (!token) {
    clearSession();
    window.location.href = "/login";
    throw new Error("Unauthorized: No token");
  }

  const headers = options.headers || {};
  headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    window.location.href = "/login";
    throw new Error("Unauthorized: Token expired");
  }

  return res;
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function initLoginPage() {
  const form = document.getElementById("login-form");
  if (!form) return;

  // 🧛 GHOST LOGIN: Welcome Back Logic
  const lastUser = getUser();
  if (lastUser && lastUser.email && !isAuthenticated()) {
    const welcome = document.createElement("div");
    welcome.className = "welcome-back-msg";
    welcome.textContent = `Welcome Back, ${lastUser.email.split('@')[0]} unit`;
    form.prepend(welcome);

    const emailInput = document.getElementById("login-email");
    if (emailInput) emailInput.value = lastUser.email;
  }

  form.addEventListener("submit", async (e) => {

    e.preventDefault();
    hideAlert("login-alert");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      showAlert("login-alert", "Please enter your email and password.");
      return;
    }

    setLoading("login-btn", true, "Sign In");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data.access_token) {
        _triggerSuccessBurst();
        saveSession(data.access_token, data.user);
        setTimeout(() => window.location.replace("/dashboard"), 600);
      } else {

        showAlert("login-alert", data.error || "Login failed. Please try again.");
      }
    } catch (err) {
      showAlert("login-alert", "Network error. Please check your connection.");
    } finally {
      setLoading("login-btn", false, "Sign In");
    }
  });
}

// ─── Signup Page ──────────────────────────────────────────────────────────────

function initSignupPage() {
  const form = document.getElementById("signup-form");
  if (!form) return;

  // Auto-redirect disabled to allow account switching

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("signup-alert");

    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (!email || !password || !confirm) {
      showAlert("signup-alert", "Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      showAlert("signup-alert", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      showAlert("signup-alert", "Passwords do not match.");
      return;
    }

    setLoading("signup-btn", true, "Create Account");

    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        _triggerSuccessBurst();
        const modal = document.getElementById("verify-modal");
        if (modal) {
          modal.classList.add("visible");
          setTimeout(() => { window.location.replace("/login"); }, 2000);
        } else {
          showAlert(
            "signup-alert",
            "Account created! Check your email to confirm, then sign in.",
            "success"
          );
          setTimeout(() => { window.location.replace("/login"); }, 2400);
        }
      } else {

        showAlert("signup-alert", data.error || "Signup failed. Please try again.");
      }
    } catch (err) {
      showAlert("signup-alert", "Network error. Please check your connection.");
    } finally {
      setLoading("signup-btn", false, "Create Account");
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // --- 🛡️ Loop Prevention Engine (FUTURE-PROOF) ---
  const params = new URLSearchParams(window.location.search);
  if (params.get("session_expired") === "1") {
    console.warn("Session expired on server. Purging local identity...");
    clearSession();
    // Clean URL
    const url = new URL(window.location);
    url.searchParams.delete("session_expired");
    window.history.replaceState({}, document.title, url);
  }

  initLoginPage();
  initSignupPage();
  setupGlobalLogout();
  initActivityMonitor();
});

// ─── Inactivity Timeout Monitor ──────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // Exact 15 mins (900,000ms)
let idleTimer;

function sessionTimeoutTriggered() {
  if (!isAuthenticated()) return;
  clearSession();
  sessionStorage.clear();
  try { if (window.supabase) window.supabase.auth.signOut(); } catch (e) { }

  // Create beautiful glassmorphic Session Expired overlay
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-[99999] flex items-center justify-center bg-white/40 backdrop-blur-md transition-opacity duration-500 opacity-0";
  overlay.innerHTML = `
    <div class="bg-white/60 border-[0.5px] border-black/10 shadow-2xl p-10 rounded-3xl text-center max-w-sm mx-4 backdrop-blur-3xl transform transition-transform duration-500 scale-95">
      <h2 class="text-3xl font-serif font-bold text-black mb-3 text-transparent bg-clip-text bg-gradient-to-r from-[#FF007F] to-[#FF8C00]">Session Expired</h2>
      <p class="text-sm font-medium text-gray-500 leading-relaxed mb-8">You have been inactive for 15 minutes. For your security, your session has been closed.</p>
      <div class="w-8 h-8 border-[3px] border-[#FF8C00] border-t-[#FF007F] rounded-full animate-spin mx-auto"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Trigger animations
  requestAnimationFrame(() => {
    overlay.classList.remove("opacity-0");
    overlay.firstElementChild.classList.remove("scale-95");
  });

  // Redirect after 40s
  setTimeout(() => {
    window.location.replace("/?session=expired");
  }, 40000);
}


function resetIdleTimer() {
  if (!isAuthenticated()) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(sessionTimeoutTriggered, IDLE_TIMEOUT_MS);
}

function initActivityMonitor() {
  if (!isAuthenticated()) return;
  window.addEventListener("mousemove", resetIdleTimer);
  window.addEventListener("mousedown", resetIdleTimer);
  window.addEventListener("keypress", resetIdleTimer);
  window.addEventListener("touchstart", resetIdleTimer);
  window.addEventListener("scroll", resetIdleTimer);
  resetIdleTimer();
}
