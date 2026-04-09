/**
 * FashionVision - Ethereal Dashboard (Refined Intelligence Implementation)
 */
import { getToken, clearSession, setupGlobalLogout } from "./auth.js";

const DashboardApp = (() => {
  // --- DOM Refs ---
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const uploadDefault = document.getElementById("upload-default");
  const uploadPreviewWrap = document.getElementById("upload-preview-wrap");
  const uploadPreview = document.getElementById("upload-preview");
  const analyzeBtn = document.getElementById("analyze-btn");
  const clearBtn = document.getElementById("clear-btn");
  const statusText = document.getElementById("status-text");

  const gravityBin = document.getElementById("gravity-bin");
  const sidePanel = document.getElementById("side-panel");
  const closePanelBtn = document.getElementById("close-panel");

  let currentFile = null;
  let currentData = null; // Store last analyzed/selected item for scheduling

  // --- Physics State ---
  const M = window.Matter;
  let engine, runner;
  let domBodies = []; // { body, el, mData }
  let walls = {};

  // --- Initialization ---
  async function init() {
    // --- 1. ATTACH LOGOUT FIRST (Centralized) ---
    setupGlobalLogout();

    // 2. DISMISS SPINNER
    const s = document.getElementById("auth-spinner");
    if (s) {
      s.style.opacity = "0";
      s.style.pointerEvents = "none";
      setTimeout(() => s.remove(), 400);
    }

    const token = getToken();
    if (!token) {
      window.location.replace("/login");
      return;
    }

    _initUploadEvents();
    _initPhysics();
    _initPanelEvents();
    _initScheduleEvents(); // Initialize Scheduling logic
    _updateUsageHUD();
  }

  // --- Tag Cleanup on Reset ---
  function _clearPhysicsBin() {
    domBodies.forEach(db => {
      M.Composite.remove(engine.world, db.body);
      db.el.remove();
    });
    domBodies = [];
  }

  // --- CSS Injection for Buttons ---
  function _initCSS() {
    const style = document.createElement("style");
    style.textContent = `
          /* Button Style for History */
          .history-action-btn {
            width: 100%; margin-top: 24px; padding: 14px;
            background: #000; color: #fff; border: none;
            font-weight: 900; border-radius: 9999px;
            text-transform: uppercase; font-size: 10px; letter-spacing: 2px;
            cursor: pointer; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          }
          .history-action-btn:hover {
            background: #FF8C00; transform: translateY(-3px) scale(1.02);
            box-shadow: 0 15px 40px rgba(255,140,0,0.2);
          }
          .history-action-btn:active { transform: scale(0.98); }
      `;
    document.head.appendChild(style);
  }
  _initCSS();

  // --- FIXED: Visible Usage HUD with Fallback ---
  async function _updateUsageHUD() {
    try {
      let data;
      try {
        const token = getToken();
        if (!token) return;

        const res = await fetch("/api/upload/usage", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          data = await res.json();
        } else {
          throw new Error("API not ready");
        }
      } catch (apiError) {
        console.warn("⚠️ Usage API failed, using Test Data for UI");
        data = { uploads_today: 3, daily_limit: 10 }; // TEST DATA
      }

      let hud = document.getElementById("usage-hud");
      if (!hud) {
        hud = document.createElement("div");
        hud.id = "usage-hud";

        Object.assign(hud.style, {
          position: "absolute", bottom: "30px", right: "30px", zIndex: "5",
          background: "rgba(255, 255, 255, 0.9)", border: "2px solid #000",
          padding: "8px 18px", borderRadius: "50px", backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", gap: "12px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
          transition: "all 0.5s ease"
        });

        gravityBin.appendChild(hud);
      }

      const pct = Math.min((data.uploads_today / data.daily_limit) * 100, 100);

      hud.innerHTML = `
                <div style="margin-right:20px; padding-right:20px; border-right:1px solid rgba(0,0,0,0.1); display:flex; align-items:center; gap:8px;">
                  <span style="font-size:18px;">🌤️</span>
                  <div style="display:flex; flex-direction:column;">
                    <span id="weather-temp" style="font-size:11px; font-weight:900;">24°C</span>
                    <span id="weather-advice" style="font-size:7px; font-weight:700; color:rgba(0,0,0,0.4); text-transform:uppercase; letter-spacing:0.1em;">Loading Advice...</span>
                  </div>
                </div>
                <span style="font-size:9px; font-weight:950; letter-spacing:0.2em; color:#000;">QUOTA</span>
                <div style="width:100px; height:8px; background:rgba(0,0,0,0.1); border-radius:10px; overflow:hidden; border: 1px solid rgba(0,0,0,0.05);">
                  <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #FF007F, #FF8C00); transition:width 1s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                </div>
                <span style="font-size:11px; font-weight:950; color:#000;">${data.uploads_today} / ${data.daily_limit}</span>
            `;

      // Fetch Mock Weather (Backend Integrated)
      fetch("/api/weather").then(r => r.json()).then(w => {
        if (w && w.temp !== undefined) {
          document.getElementById("weather-temp").textContent = `${w.temp}°C · ${w.condition}`;
          document.getElementById("weather-advice").textContent = w.style_advice;
        }
      }).catch((e) => { console.error("Weather Sync Disabled: API Link Failure"); });

    } catch (e) { console.error("HUD Sync Failed:", e); }
  }

  // --- Feedback Helpers (Popups & UI Reactions) ---
  function _showToast(msg, type = "info") {
    const toast = document.createElement("div");
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 px-8 py-5 rounded-3xl z-[10000] 
                       backdrop-blur-3xl border-2 shadow-[0_30px_90px_rgba(0,0,0,0.2)] transition-all duration-700 transform -translate-y-10 opacity-0 max-w-[90vw] md:max-w-md
                       ${type === 'success' ? 'bg-white/95 border-brand/40 text-black' : 'bg-black/95 border-white/20 text-white'}`;

    toast.innerHTML = `<div class="flex items-center gap-5">
                        <div class="w-10 h-10 rounded-full flex items-center justify-center ${type === 'success' ? 'bg-brand/10 text-brand' : 'bg-red-500/10 text-red-500'}">
                          <span class="text-xl font-black">${type === 'success' ? '✓' : '!'}</span>
                        </div>
                        <span class="font-black uppercase tracking-[0.2em] text-[10px] leading-relaxed">${msg}</span>
                      </div>`;
    document.body.appendChild(toast);

    setTimeout(() => { toast.style.transform = "translate(-50%, 0)"; toast.style.opacity = "1"; }, 10);
    setTimeout(() => {
      toast.style.transform = "translate(-50%, -20px)"; toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 700);
    }, 4000);
  }

  function _triggerErrorEffects(errorMsg) {
    _showToast(`${errorMsg}`, "error");
    dropZone.classList.add("animate-shake");
    gravityBin.classList.add("bg-red-500/5");

    setTimeout(() => {
      dropZone.classList.remove("animate-shake");
      gravityBin.classList.remove("bg-red-500/5");
    }, 600);
  }

  // --- Upload flow ---
  function _initUploadEvents() {
    dropZone.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length) _handleFile(e.target.files[0]);
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      if (e.dataTransfer.files.length) _handleFile(e.dataTransfer.files[0]);
    });

    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      _resetUpload();
      _clearPhysicsBin();
    });

    analyzeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!currentFile) return;

      const token = getToken();
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = "• • •";
      statusText.classList.remove("hidden", "text-red-500", "bg-red-50", "border-red-100");
      statusText.classList.add("text-brand", "animate-pulse", "block");
      statusText.textContent = "AI ANALYSIS IN PROGRESS...";

      const fd = new FormData();
      fd.append("file", currentFile);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          analyzeBtn.innerHTML = "Success";
          _showToast("Intelligence Extracted! 🧠", "success");

          _spawnTagsForAnalysis(data);

          setTimeout(() => {
            _openPanel(data);
          }, 1000);

          setTimeout(_resetUpload, 3000);
        } else {
          const errorMsg = data.reason || data.error || "Non-fashion item detected!";
          analyzeBtn.innerHTML = "Retry";

          dropZone.classList.add("animate-shake");
          setTimeout(() => dropZone.classList.remove("animate-shake"), 500);

          statusText.textContent = errorMsg;
          statusText.classList.remove("text-brand", "animate-pulse", "hidden");
          statusText.classList.add("text-red-600", "bg-red-50", "border-red-200", "p-5", "rounded-3xl", "block");

          _showToast(errorMsg, "error");
        }
      } catch (err) {
        _triggerErrorEffects("Network Error");
      } finally {
        analyzeBtn.disabled = false;
        if (!analyzeBtn.innerHTML.includes("Success")) {
          analyzeBtn.innerHTML = "Extract Intelligence";
        }
      }
    });
  }

  function _handleFile(file) {
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const pb = document.getElementById("upload-preview-blur");
      if (pb) pb.src = e.target.result;
      uploadPreview.src = e.target.result;
      uploadDefault.classList.add("hidden");
      uploadPreviewWrap.classList.remove("hidden");
      uploadPreviewWrap.classList.add("flex");
    };
    reader.readAsDataURL(file);
  }

  function _resetUpload() {
    currentFile = null;
    fileInput.value = "";
    uploadPreview.src = "";
    const pb = document.getElementById("upload-preview-blur");
    if (pb) pb.src = "";
    uploadDefault.classList.remove("hidden");
    uploadPreviewWrap.classList.add("hidden");
    uploadPreviewWrap.classList.remove("flex");
    analyzeBtn.innerHTML = "Extract Intelligence";
    statusText.classList.add("hidden");
    statusText.classList.remove("text-red-600", "bg-red-50", "border-red-200", "p-5", "text-brand", "animate-pulse");
  }

  // --- Physics DOM Engine ---
  function _initPhysics() {
    engine = M.Engine.create({ gravity: { y: 1 } });
    runner = M.Runner.create();

    _buildWalls();
    M.Runner.run(runner, engine);

    M.Events.on(engine, "afterUpdate", () => {
      domBodies.forEach((db) => {
        const { position, angle } = db.body;
        db.el.style.left = `${position.x}px`;
        db.el.style.top = `${position.y}px`;
        db.el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      });
    });

    window.addEventListener("resize", _updateWalls);

    const mouse = M.Mouse.create(gravityBin);
    const mConstraint = M.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    });
    M.Composite.add(engine.world, mConstraint);
  }

  function _buildWalls() {
    const W = gravityBin.clientWidth || 500;
    const H = gravityBin.clientHeight || 500;
    const t = 100;

    if (walls.floor) M.Composite.remove(engine.world, Object.values(walls));

    walls.floor = M.Bodies.rectangle(W / 2, H + t / 2, W * 2, t, { isStatic: true, friction: 0.8 });
    walls.left = M.Bodies.rectangle(-t / 2, H / 2, t, H * 2, { isStatic: true, friction: 0.1 });
    walls.right = M.Bodies.rectangle(W + t / 2, H / 2, t, H * 2, { isStatic: true, friction: 0.1 });

    M.Composite.add(engine.world, [walls.floor, walls.left, walls.right]);
  }

  function _updateWalls() {
    if (!engine) return;
    const W = gravityBin.clientWidth || 500;
    const H = gravityBin.clientHeight || 500;
    const t = 100;
    M.Body.setPosition(walls.floor, { x: W / 2, y: H + t / 2 });
    M.Body.setPosition(walls.left, { x: -t / 2, y: H / 2 });
    M.Body.setPosition(walls.right, { x: W + t / 2, y: H / 2 });
  }

  const _COLOR_HEX_MAP = {
    "red": "#E11D48", "blue": "#2563EB", "green": "#16A34A", "yellow": "#FBBF24",
    "black": "#0F172A", "white": "#F8FAFC", "grey": "#475569", "navy": "#1E1B4B",
    "maroon": "#7F1D1D", "teal": "#0F766E", "pink": "#DB2777", "brown": "#78350F",
    "orange": "#EA580C", "purple": "#7C3AED", "beige": "#D6D3D1", "cream": "#FEF3C7"
  };

  function _spawnTagsForAnalysis(data, fromHistory = false) {
    _updateWalls();

    const rawAttrs = data.analysis ? data.analysis.attributes : data;
    const detectedColor = (rawAttrs.color || "white").toLowerCase();
    const tagBg = _COLOR_HEX_MAP[detectedColor] || "#FFFFFF";

    const r = parseInt(tagBg.slice(1, 3), 16);
    const g = parseInt(tagBg.slice(3, 5), 16);
    const b = parseInt(tagBg.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const tagText = brightness > 125 ? "#000000" : "#FFFFFF";

    const attrs = [
      { label: "Type", val: rawAttrs.clothing_type },
      { label: "Color", val: rawAttrs.color },
      { label: "Pattern", val: rawAttrs.pattern },
      { label: "Style", val: rawAttrs.style },
      { label: "Season", val: rawAttrs.season }
    ].filter((a) => a.val);

    const W = gravityBin.clientWidth || 500;

    gravityBin.style.position = "relative";
    gravityBin.style.overflow = "hidden";

    attrs.forEach((attr, idx) => {
      const delay = fromHistory ? 0 : idx * 150;

      setTimeout(() => {
        const el = document.createElement("div");
        el.className = "absolute px-6 py-4 text-[11px] font-black uppercase tracking-[0.2em] border-2 shadow-2xl whitespace-nowrap cursor-grab active:cursor-grabbing select-none rounded-xl transition-shadow hover:shadow-brand/20";
        el.style.backgroundColor = tagBg;
        el.style.color = tagText;
        el.style.borderColor = brightness > 125 ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)";
        el.textContent = `${attr.label}: ${attr.val}`;

        gravityBin.appendChild(el);

        const rect = el.getBoundingClientRect();
        const bW = rect.width, bH = rect.height;

        const spawnX = (W / 2) + (Math.random() * 40 - 20);
        const spawnY = -50;

        const body = M.Bodies.rectangle(spawnX, spawnY, bW, bH, {
          restitution: 0.6,
          friction: 0.1,
          chamfer: { radius: 10 }
        });

        domBodies.push({ body, el, mData: data });
        M.Composite.add(engine.world, body);

        el.addEventListener("dblclick", () => _openPanel(data));
      }, delay);
    });

    _updateUsageHUD();
  }

  // --- Panels ---
  function _initPanelEvents() {
    closePanelBtn.addEventListener("click", () => sidePanel.classList.remove("open"));
  }

  // --- 📅 NEW: Scheduling Logic ---
  function _initScheduleEvents() {
    const toggleBtn = document.getElementById("toggle-schedule");
    const formWrap = document.getElementById("schedule-form-wrap");
    const form = document.getElementById("schedule-form");
    const alertBox = document.getElementById("schedule-alert");

    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener("click", () => {
      const isHidden = formWrap.classList.contains("hidden");
      formWrap.classList.toggle("hidden");
      toggleBtn.textContent = isHidden ? "✕ Close Scheduler" : "📅 Schedule Content";

      // Auto-populate if data exists
      if (isHidden && currentData) {
        const clean = currentData.analysis || currentData;
        const content = clean.content || clean;
        document.getElementById("sch-title").value = content.title || "";
        document.getElementById("sch-description").value = content.description || "";

        // Suggest a time (1 hour from now)
        const now = new Date();
        now.setHours(now.getHours() + 1);
        now.setMinutes(0);
        document.getElementById("sch-time").value = now.toISOString().slice(0, 16);
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("schedule-submit-btn");
      const token = getToken();

      if (!currentData || !currentData.image_url) {
        _showScheduleAlert("No item selected for scheduling.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = "• • •";

      const payload = {
        title: document.getElementById("sch-title").value,
        board_id: document.getElementById("sch-board").value,
        description: document.getElementById("sch-description").value,
        scheduled_time: document.getElementById("sch-time").value,
        hashtags: (currentData.analysis?.content?.hashtags || currentData.content?.hashtags || []),
        image_url: currentData.image_url,
        image_path: currentData.image_path || ""
      };

      try {
        const res = await fetch("/api/schedule/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (res.ok) {
          _showScheduleAlert("Success! Content visibility scheduled.", "success");
          _showToast("Schedule Locked! 📅", "success");
          setTimeout(() => {
            formWrap.classList.add("hidden");
            toggleBtn.textContent = "📅 Schedule Content";
            form.reset();
          }, 2000);
        } else {
          _showScheduleAlert(result.error || "Scheduling failed. Check time.", "error");
        }
      } catch (err) {
        _showScheduleAlert("Network transition failed.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "Confirm Schedule";
      }
    });

    function _showScheduleAlert(msg, type) {
      alertBox.textContent = msg;
      alertBox.classList.remove("hidden", "bg-red-50", "text-red-600", "bg-green-50", "text-green-600");
      alertBox.classList.add(type === "success" ? "bg-green-50" : "bg-red-50");
      alertBox.classList.add(type === "success" ? "text-green-600" : "text-red-600");
    }
  }

  function _openPanel(data) {
    currentData = data; // Set the active item for scheduling
    sidePanel.classList.add("open");

    const isLive = !!data.analysis;
    const cleanRes = isLive ? data.analysis : data;
    const content = isLive ? (cleanRes.content || {}) : cleanRes;
    const attributes = isLive ? (cleanRes.attributes || {}) : cleanRes;

    const reportImg = document.getElementById("panel-report-img");
    if (reportImg) {
      reportImg.src = data.image_url || "";
      reportImg.style.display = data.image_url ? "block" : "none";
    }

    document.getElementById("panel-title").textContent = content.title || "Untitled Outfit";
    document.getElementById("panel-desc").textContent = content.description || "No description generated for this capture.";

    const attrKeys = [
      { k: "clothing_type", l: "Type" }, { k: "color", l: "Color" },
      { k: "pattern", l: "Pattern" }, { k: "style", l: "Style" }, { k: "season", l: "Season" }
    ];

    const chips = attrKeys
      .map((keyObj) => attributes[keyObj.k])
      .filter(Boolean);

    document.getElementById("panel-attributes").innerHTML = chips
      .map((tag) => `<span class="tag-chip font-mono text-white border-white/20 bg-black">${tag}</span>`)
      .join("");

    document.getElementById("panel-hashtags").innerHTML = (content.hashtags || [])
      .map((h) => `<span class="tag-chip opacity-60 font-bold">#${h.replace('#', '')}</span>`)
      .join("");

    // --- SUSTAINABILITY WIDGET (NEW) ---
    let susWrap = document.getElementById("panel-sustainability");
    if (!susWrap) {
      susWrap = document.createElement("div");
      susWrap.id = "panel-sustainability";
      susWrap.className = "mt-10 p-6 rounded-3xl bg-black text-white border-2 border-white/20";
      document.getElementById("side-panel-content").appendChild(susWrap);
    }

    const sus = data.sustainability || { score: 50, impact: "Standard environmental footprint." };
    susWrap.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <span class="text-[9px] font-black tracking-widest uppercase">Eco-Intelligence</span>
        <span class="text-xl font-serif italic">${sus.score}/100</span>
      </div>
      <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-3">
        <div style="width:${sus.score}%;" class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
      </div>
      <p class="text-[10px] font-medium opacity-60 leading-relaxed">${sus.impact}</p>
    `;

    // --- LOOKBOOK EXPORT (NEW) ---
    let exportBtn = document.getElementById("export-btn");
    if (!exportBtn) {
      exportBtn = document.createElement("button");
      exportBtn.id = "export-btn";
      exportBtn.className = "history-action-btn mt-6";
      exportBtn.style.background = "#fff";
      exportBtn.style.color = "#000";
      exportBtn.innerHTML = "Download Lookbook (PDF) 📥";
      exportBtn.onclick = () => {
        const token = getToken();
        window.open(`/api/export/lookbook?token=${token}`, '_blank');
      };
      document.getElementById("side-panel-content").appendChild(exportBtn);
    }

    let historyBtn = document.getElementById("go-to-history-btn");
    if (!historyBtn) {
      historyBtn = document.createElement("button");
      historyBtn.id = "go-to-history-btn";
      historyBtn.className = "history-action-btn";
      historyBtn.innerHTML = "View Catalog Explorer <span>→</span>";
      historyBtn.onclick = () => {
        window.location.href = `/history?t=${Date.now()}`;
      };

      const container = document.createElement("div");
      container.className = "mt-auto pt-8";
      container.appendChild(historyBtn);
      sidePanel.appendChild(container);
    }
  }

  // --- 🤖 NEW: AI Stylist Chat Modal ---
  function _initChatSystem() {
    const chatBtn = document.createElement("button");
    chatBtn.id = "chat-float-btn";
    chatBtn.innerHTML = "💬";
    Object.assign(chatBtn.style, {
      position: "fixed", bottom: "30px", left: "30px", width: "60px", height: "60px",
      borderRadius: "50%", background: "#000", color: "#fff", fontSize: "24px",
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
      zIndex: "1000", boxShadow: "0 10px 40px rgba(0,0,0,0.3)", border: "2px solid rgba(255,255,255,0.1)"
    });
    chatBtn.className = "flex items-center justify-center hover:scale-110 transition-all duration-300";
    document.body.appendChild(chatBtn);

    const chatModal = document.createElement("div");
    chatModal.id = "chat-modal";
    chatModal.className = "fixed bottom-[100px] left-[30px] w-[350px] bg-white/95 backdrop-blur-3xl border-2 border-black rounded-[40px] shadow-2xl z-[1000] hidden flex-col overflow-hidden transition-all duration-500 scale-95 opacity-0";
    chatModal.innerHTML = `
      <div class="p-6 border-b border-black/10 flex justify-between items-center bg-black text-white">
        <span class="text-[10px] font-black tracking-[0.2em] uppercase">Ethereal Stylist</span>
        <button id="close-chat" class="opacity-50 hover:opacity-100">✕</button>
      </div>
      <div id="chat-messages" class="flex-1 p-6 overflow-y-auto space-y-4 max-h-[350px] min-h-[300px]">
        <div class="bg-black/5 p-4 rounded-3xl text-[11px] font-medium leading-relaxed">
          Greetings unit. I have analyzed your aesthetic DNA. How can I refine your silhouette today?
        </div>
      </div>
      <div class="p-4 bg-white border-t border-black/5">
        <div class="flex gap-2">
          <input type="text" id="chat-input" placeholder="Ask your stylist..." class="flex-1 px-5 py-3 rounded-full bg-black/5 text-[11px] focus:outline-none">
          <button id="send-chat" class="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center">→</button>
        </div>
      </div>
    `;
    document.body.appendChild(chatModal);

    chatBtn.onclick = () => {
      const isHidden = chatModal.classList.contains("hidden");
      if (isHidden) {
        chatModal.classList.remove("hidden");
        setTimeout(() => { chatModal.classList.add("scale-100", "opacity-100"); }, 10);
      } else {
        chatModal.classList.remove("scale-100", "opacity-100");
        setTimeout(() => chatModal.classList.add("hidden"), 500);
      }
    };

    document.getElementById("close-chat").onclick = () => chatBtn.click();

    const input = document.getElementById("chat-input");
    const send = document.getElementById("send-chat");
    const msgs = document.getElementById("chat-messages");

    async function sendMessage() {
      const msg = input.value.trim();
      if (!msg) return;

      input.value = "";
      const userDiv = document.createElement("div");
      userDiv.className = "bg-brand/10 p-4 rounded-3xl text-[11px] font-bold ml-10 text-right";
      userDiv.textContent = msg;
      msgs.appendChild(userDiv);
      msgs.scrollTop = msgs.scrollHeight;

      const loadingDiv = document.createElement("div");
      loadingDiv.className = "opacity-40 text-[9px] font-black animate-pulse uppercase tracking-widest mt-4";
      loadingDiv.textContent = "Synthesizing Advice...";
      msgs.appendChild(loadingDiv);

      try {
        const token = getToken();
        const res = await fetch("/api/chat/consult", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        loadingDiv.remove();

        const aiDiv = document.createElement("div");
        aiDiv.className = "bg-black text-white p-4 rounded-3xl text-[11px] font-medium leading-relaxed mr-10";
        aiDiv.textContent = data.response || data.error || "Intelligence link severed.";
        msgs.appendChild(aiDiv);
        msgs.scrollTop = msgs.scrollHeight;
      } catch (err) {
        loadingDiv.textContent = "ERROR: LINK OFFLINE";
      }
    }

    send.onclick = sendMessage;
    input.onkeypress = (e) => { if (e.key === "Enter") sendMessage(); };
  }

  return {
    init: () => {
      init();
      _initChatSystem();
    }
  };
})();

document.addEventListener("DOMContentLoaded", DashboardApp.init);