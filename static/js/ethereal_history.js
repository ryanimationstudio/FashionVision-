/**
 * FashionVision - FULL WORKING HISTORY SYSTEM (Ultimate Master Version)
 * Features Included:
 * - 🚫 PERMANENT DELETE BY URL (100% Duplicate Proof)
 * - 🧱 Invisible Walls & Overflow Fix 
 * - 🤏 Optimized Card Size (120x180)
 * - 🧲 Reliable Drag & Drop (Matter.js Constraint)
 * - 📋 INTELLIGENCE REPORT: Click to View Analysis
 * - 🛠️ FIXED: Ghost Event Listeners Memory Leak
 * - 🛠️ FIXED: 7-Second Mix & Match Timer Trap
 * - 🛠️ FIXED: Missing Mix-Status Floating HUD
 */

import { getToken, clearSession, setupGlobalLogout } from "./auth.js";

const App = (() => {
  const M = window.Matter;

  let engine, runner, ground, leftWall, rightWall;
  let bodies = [];
  let dragConstraint = null;
  let selectionBuffer = [];
  let activeHudListener = null; // FIX 1: Tracker for global click listeners

  let isFetching = false;
  let lastLoadTime = 0;
  const loggedBroken = new Set();

  const container = document.getElementById("archive-bin");
  const loading = document.getElementById("loading-txt");
  const sidePanel = document.getElementById("archive-side-panel");
  const closePanelBtn = document.getElementById("panel-close-btn");

  // ================= ✅ BLACKLIST LOGIC =================
  const getDeletedUrls = () => JSON.parse(localStorage.getItem("fv_deleted_urls") || "[]");
  const markAsDeleted = (url) => {
    const deleted = getDeletedUrls();
    if (!deleted.includes(url)) {
      deleted.push(url);
      localStorage.setItem("fv_deleted_urls", JSON.stringify(deleted));
    }
  };

  // ================= CSS & Base DOM Injection =================
  function _buildBaseDOM() {
    const style = document.createElement("style");
    style.textContent = `
      body, html { margin: 0; padding: 0; overflow-x: hidden; width: 100vw; }
      #archive-bin { position: fixed; inset: 0; overflow: hidden; z-index: 10; background: transparent; pointer-events: none; }
      .card {
        position: absolute; width: 130px; height: 190px; padding: 10px;
        background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.12);
        border: 1px solid rgba(0,0,0,0.03); cursor: grab; opacity: 0; transition: opacity 0.4s ease;
        will-change: transform; pointer-events: auto; z-index: 100;
      }
      .card img { width: 100%; height: 85%; object-fit: cover; border-radius: 8px; margin-bottom: 5px; }
      .card:active { cursor: grabbing; box-shadow: 0 25px 60px rgba(0,0,0,0.2); }
      .delete {
        position: absolute; top: -8px; right: -8px; background: #000; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        cursor: pointer; z-index: 200; font-size: 14px; border: 2px solid #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        opacity: 0; transition: opacity 0.3s;
      }
      .card:hover .delete { opacity: 1; }
      .delete:hover { background: #ef4444; transform: scale(1.1); }
      
      /* FIX 3: Floating Mix Status HUD */
      #mix-status {
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) scale(0.9);
        background: rgba(10,10,14,0.95); border: 1px solid rgba(236,72,153,0.3);
        padding: 12px 24px; border-radius: 50px; display: flex; align-items: center; gap: 15px;
        opacity: 0; pointer-events: none; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        z-index: 9000; box-shadow: 0 20px 40px rgba(0,0,0,0.5); backdrop-filter: blur(10px);
      }
      #mix-status.show { opacity: 1; transform: translateX(-50%) scale(1); pointer-events: all; }

      /* ✨ GHOST PULSE AURA */
      @keyframes pulseAura {
        0% { box-shadow: 0 0 10px rgba(236,72,153,0.4); }
        50% { box-shadow: 0 0 40px rgba(236,72,153,0.8); }
        100% { box-shadow: 0 0 10px rgba(236,72,153,0.4); }
      }
      .card-selected {
        outline: 6px solid #EC4899 !important;
        animation: pulseAura 1.5s infinite ease-in-out;
        z-index: 1000 !important;
      }
      .card-dissolve {
        transform: scale(1.5) !important;
        opacity: 0 !important;
        filter: blur(20px);
        pointer-events: none;
        transition: 0.5s ease-out !important;
      }
    `;

    document.head.appendChild(style);

    // Inject Selection Tracker UI
    const statusHUD = document.createElement("div");
    statusHUD.id = "mix-status";
    statusHUD.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div id="mix-preview" style="display:flex; margin-right:8px;"></div>
        <span id="mix-label" style="color:#000; font-weight:900; font-size:9px; letter-spacing:0.2em; text-transform:uppercase;">Synergy Check: 0/2 Units</span>
      </div>
      <button id="mix-cancel" style="background:rgba(0,0,0,0.05); border:none; color:#000; cursor:pointer; width:32px; height:32px; border-radius:50%; font-size:18px; line-height:32px; transition:0.3s; margin-left:12px;">×</button>
    `;
    document.body.appendChild(statusHUD);

    document.getElementById("mix-cancel").onclick = _clearSelection;
  }

  // ================= Physics Initialization =================
  function initPhysics() {
    engine = M.Engine.create({ gravity: { y: 0.1 } });
    runner = M.Runner.create();

    ground = M.Bodies.rectangle(window.innerWidth / 2, window.innerHeight, window.innerWidth * 3, 20, { isStatic: true, friction: 0.8 });
    leftWall = M.Bodies.rectangle(-25, window.innerHeight / 2, 50, window.innerHeight * 3, { isStatic: true, friction: 0.2 });
    rightWall = M.Bodies.rectangle(window.innerWidth + 25, window.innerHeight / 2, 50, window.innerHeight * 3, { isStatic: true, friction: 0.2 });

    M.World.add(engine.world, [ground, leftWall, rightWall]);

    M.Events.on(runner, "tick", () => {
      bodies.forEach(obj => {
        const { position, angle } = obj.body;
        obj.el.style.transform = `translate(${position.x}px, ${position.y}px) translate(-50%, -50%) rotate(${angle}rad)`;
      });
    });

    M.Runner.run(runner, engine);

    const activateGravity = () => { if (engine.gravity.y < 0.5) { engine.gravity.y = 1.2; } };
    window.addEventListener("mousedown", activateGravity, { once: true });
    window.addEventListener("touchstart", activateGravity, { once: true });
    window.addEventListener("wheel", activateGravity, { once: true });

    window.addEventListener("resize", () => {
      M.Body.setPosition(ground, { x: window.innerWidth / 2, y: window.innerHeight });
      M.Body.setPosition(leftWall, { x: -25, y: window.innerHeight / 2 });
      M.Body.setPosition(rightWall, { x: window.innerWidth + 25, y: window.innerHeight / 2 });
    });

    window.addEventListener("pointermove", (e) => {
      if (dragConstraint) dragConstraint.pointA = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("pointerup", () => {
      if (dragConstraint) {
        M.World.remove(engine.world, dragConstraint);
        dragConstraint = null;
      }
    });

    if (closePanelBtn) {
      closePanelBtn.onclick = () => sidePanel?.classList.remove("open");
    }
  }

  // ================= Record Spawning =================
  function spawn(items) {
    const existingUrls = new Set(bodies.map(b => b.url));

    items.forEach((item, idx) => {
      if (existingUrls.has(item.image_url)) return;

      const el = document.createElement("div");
      el.className = "card";

      const img = document.createElement("img");
      img.src = item.image_url || "https://via.placeholder.com/300x400?text=Image+Not+Found";
      img.onload = () => { el.style.opacity = "1"; };
      img.onerror = () => {
        if (!loggedBroken.has(item.id)) {
          console.warn("Broken Link:", item.id);
          loggedBroken.add(item.id);
        }
        img.src = "https://via.placeholder.com/300x400?text=Image+Not+Found";
        el.style.opacity = "1";
      };
      el.appendChild(img);

      const randomX = Math.max(100, Math.min(window.innerWidth - 100, Math.random() * window.innerWidth));
      const body = M.Bodies.rectangle(randomX, -100 - (idx * 50), 120, 180, {
        restitution: 0.2, friction: 0.8, frictionAir: 0.04, chamfer: { radius: 8 }, inertia: Infinity, angle: 0
      });

      // ✅ MODIFIED CLICK HANDLER (Fixes Ghost Listeners)
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("delete")) return;

        // Cleanup existing HUD and its listener first
        const existingHud = document.getElementById("action-hud-global");
        if (existingHud) existingHud.remove();
        if (activeHudListener) {
          window.removeEventListener("click", activeHudListener, { capture: true });
        }

        const hud = document.createElement("div");
        hud.id = "action-hud-global";
        hud.style = `position: fixed; top: ${e.clientY}px; left: ${e.clientX}px; 
          transform: translate(-50%, -100%); margin-top: -20px;
          background: rgba(10,10,14,0.95); backdrop-filter: blur(25px); 
          border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; 
          padding: 16px; display: flex; flex-direction: column; gap: 10px; z-index: 9999;
          box-shadow: 0 30px 60px rgba(0,0,0,0.8); min-width: 220px;`;

        const btnView = document.createElement("button");
        btnView.innerHTML = "✦ <span style='margin-left:8px'>VIEW INTELLIGENCE</span>";
        btnView.style = "background:rgba(255,255,255,0.05); border:none; color:#fff; font-size:11px; font-weight:800; cursor:pointer; padding:12px; text-align:left; border-radius:8px; transition:0.3s;";
        btnView.onmouseover = () => btnView.style.background = "rgba(255,255,255,0.1)";
        btnView.onmouseout = () => btnView.style.background = "rgba(255,255,255,0.05)";
        btnView.onclick = (ev) => {
          ev.stopPropagation();
          hud.remove();
          const currentData = bodies.map(b => b.data);
          const currentIdx = currentData.indexOf(item);
          window.IntelligenceDeck?.open(currentData, currentIdx);
        };

        const btnMix = document.createElement("button");
        btnMix.innerHTML = "✦ <span style='margin-left:8px'>SELECT FOR MIX & MATCH</span>";
        btnMix.style = "background:rgba(236,72,153,0.1); border:1px solid rgba(236,72,153,0.2); color:#EC4899; font-size:11px; font-weight:800; cursor:pointer; padding:12px; text-align:left; border-radius:8px; transition:0.3s;";
        btnMix.onmouseover = () => btnMix.style.background = "rgba(236,72,153,0.2)";
        btnMix.onmouseout = () => btnMix.style.background = "rgba(236,72,153,0.1)";
        btnMix.onclick = (ev) => {
          ev.stopPropagation();
          hud.remove();
          _handleSelection(item, el);
        };

        hud.appendChild(btnView);
        hud.appendChild(btnMix);
        document.body.appendChild(hud);

        // Track the listener so we can cleanly remove it later
        activeHudListener = (ev) => {
          if (!hud.contains(ev.target)) {
            hud.remove();
            window.removeEventListener("click", activeHudListener, { capture: true });
          }
        };
        setTimeout(() => {
          window.addEventListener("click", activeHudListener, { capture: true });
        }, 10);
      });

      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".action-hud") || e.target.classList.contains("delete")) return;
        dragConstraint = M.Constraint.create({
          pointA: { x: e.clientX, y: e.clientY }, bodyB: body, pointB: { x: 0, y: 0 }, stiffness: 0.2, damping: 0.1
        });
        M.World.add(engine.world, dragConstraint);
      });

      const del = document.createElement("div");
      del.className = "delete";
      del.innerHTML = "×";
      del.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm("Erase intelligence record?")) return;

        // 💥 PHYSICS FORCE BURST
        const burstPos = body.position;
        bodies.forEach(other => {
          if (other.body === body) return;
          const dx = other.body.position.x - burstPos.x;
          const dy = other.body.position.y - burstPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 400) {
            const force = (400 - dist) / 1500;
            M.Body.applyForce(other.body, other.body.position, {
              x: (dx / dist) * force,
              y: (dy / dist) * force
            });
          }
        });

        if (dragConstraint && dragConstraint.bodyB === body) {
          M.World.remove(engine.world, dragConstraint);
          dragConstraint = null;
        }

        // 🎨 DISSOLVE ANIMATION
        el.classList.add("card-dissolve");
        setTimeout(() => {
          markAsDeleted(item.image_url);
          M.World.remove(engine.world, body);
          el.remove();
          bodies = bodies.filter(b => b.url !== item.image_url);
        }, 500);

        fetch(`/api/history/${item.id}`, { method: "DELETE", headers: { Authorization: "Bearer " + getToken() } });
      };


      el.appendChild(del);
      container.appendChild(el);
      bodies.push({ id: item.id, url: item.image_url, el, body, data: item });
      M.World.add(engine.world, body);
    });
  }

  // ================= Pipeline Retrieval =================
  async function load() {
    const now = Date.now();
    if (isFetching || (now - lastLoadTime < 5000)) return;
    isFetching = true;
    lastLoadTime = now;

    try {
      const token = getToken();
      if (!token) { isFetching = false; return; }
      if (loading) {
        loading.textContent = "SYNCHRONIZING UNIQUE ASSETS...";
        loading.classList.add("animate-pulse");
      }

      const res = await fetch(`/api/history?t=${Date.now()}`, {
        method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
      });
      const data = await res.json();
      if (res.ok) {
        const uniqueItems = [];
        const seenUrls = new Set();
        const deletedUrls = new Set(getDeletedUrls());
        (data.history || []).forEach(item => {
          if (item.image_url && !seenUrls.has(item.image_url) && !deletedUrls.has(item.image_url)) {
            uniqueItems.push(item);
            seenUrls.add(item.image_url);
          }
        });
        if (loading) {
          loading.textContent = uniqueItems.length === 0 ? "ARCHIVE EMPTY" : `[ ${uniqueItems.length} UNIQUE UNITS ]`;
          loading.classList.remove("animate-pulse");
        }
        spawn(uniqueItems);

        window._fvArchiveItems = uniqueItems.map(item => ({
          imageUrl: item.image_url,
          title: item.title || "Untitled",
          desc: item.description || "",
          style: item.style || "",
          color: item.color || "",
        }));
      } else {
        if (res.status === 401) {
          if (loading) loading.textContent = "RE-AUTHENTICATING...";
          setTimeout(() => { window.location.href = "/login"; }, 1500);
          return;
        }
        throw new Error(`Fetch failed: ${res.status}`);
      }
    } catch (err) {
      console.error("Fetch failure:", err);
      if (loading) loading.textContent = "GRID OFFLINE";
    } finally {
      isFetching = false;
    }
  }

  // ================= ✅ INTERNAL MIX & MATCH SYSTEM =================
  let mixOverlay;

  // Centralized Cleanup Function (Fixes Timer Trap)
  function _clearSelection() {
    selectionBuffer.forEach(it => {
      const bodyObj = bodies.find(b => b.data === it);
      if (bodyObj) {
        bodyObj.el.classList.remove("card-selected");
      }
    });
    selectionBuffer.length = 0;

    const status = document.getElementById("mix-status");
    if (status) {
      status.classList.remove("show");
      document.getElementById("mix-preview").innerHTML = "";
    }
  }

  function _buildMixMatchDOM() {
    if (document.getElementById("fv-mix-overlay")) return;
    const css = `
      #fv-mix-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: #000;
        display: none; align-items: start; justify-content: center;
        font-family: 'Inter', sans-serif; color: #fff; opacity: 0; transition: opacity 0.6s ease;
        overflow-y: auto; padding: 40px 20px;
      }
      #fv-mix-overlay.active { display: flex; opacity: 1; }

      .mix-backdrop {
        position: fixed; inset: -50px; 
        background-size: cover; background-position: center;
        filter: blur(80px) brightness(0.2); opacity: 0.6;
        z-index: -1; transform: scale(1.1);
      }

      .mix-container {
        width: 100%; max-width: 1000px;
        display: flex; flex-direction: column; align-items: center;
        transform: translateY(30px); transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        margin: auto 0;
      }
      #fv-mix-overlay.active .mix-container { transform: translateY(0); }

      .mix-grid { 
        display: flex; gap: 40px; align-items: center; justify-content: center;
        margin: 30px 0; width: 100%; position: relative;
        flex-wrap: wrap;
      }

      .fv-mix-card { 
        width: 280px; height: 400px; border-radius: 20px; 
        overflow: hidden; border: 1px solid rgba(255,255,255,0.15);
        box-shadow: 0 40px 80px rgba(0,0,0,0.9);
      }

      .match-portal {
        width: 110px; height: 110px; border-radius: 50%;
        background: rgba(236, 72, 113, 0.9);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        box-shadow: 0 0 50px rgba(236, 72, 113, 0.4);
        z-index: 10; font-weight: 900; animation: pulseGlow 2s infinite;
      }
      @keyframes pulseGlow {
        0% { transform: scale(1); box-shadow: 0 0 30px rgba(236, 72, 113, 0.4); }
        50% { transform: scale(1.05); box-shadow: 0 0 60px rgba(236, 72, 113, 0.7); }
        100% { transform: scale(1); box-shadow: 0 0 30px rgba(236, 72, 113, 0.4); }
      }

      .mix-advice-glass {
        max-width: 800px; width: 100%;
        background: rgba(255,255,255,0.04); 
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(10px);
        padding: 30px; border-radius: 24px;
        border: 1px solid rgba(255,255,255,0.1);
        text-align: center;
      }

      #fv-mix-close {
        position: fixed; top: 30px; right: 30px;
        font-size: 32px; color: rgba(255,255,255,0.3);
        background: rgba(255,255,255,0.05); border-radius: 50%;
        width: 50px; height: 50px; border: none; cursor: pointer;
        z-index: 1001; transition: 0.3s;
      }
      #fv-mix-close:hover { background: #fff; color: #000; }

      .palette-row {
        display: flex; height: 40px; width: 100%; border-radius: 12px;
        overflow: hidden; margin-top: 25px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
        opacity: 0; transform: translateY(10px); transition: 0.8s ease;
      }
      .palette-color {
        flex: 1; display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: bold; letter-spacing: 0.1em;
        color: rgba(255,255,255,0.7); text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        transition: 0.3s;
      }
      .palette-color:hover { flex: 1.5; color: #fff; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    mixOverlay = document.createElement("div");
    mixOverlay.id = "fv-mix-overlay";
    mixOverlay.innerHTML = `
      <div class="mix-backdrop" id="fv-mix-backdrop"></div>
      <button id="fv-mix-close">×</button>
      
      <div class="mix-container">
        <span style="font-size:10px;font-weight:900;letter-spacing:0.3em;color:rgba(255,255,255,0.3);display:block;margin-bottom:10px;">VIRTUAL STYLIST INTELLIGENCE</span>
        <h2 style="font-family:'Playfair Display', serif; font-size:3rem; margin:0; font-weight:900; font-style:italic; line-height:1;">Ensemble Synergy</h2>
        
        <div class="mix-grid" id="fv-mix-grid"></div>
        <div class="mix-advice-glass" id="fv-mix-advice"></div>
      </div>
    `;
    document.body.appendChild(mixOverlay);

    // FIX 2: Clear buffer exactly when user clicks close
    document.getElementById("fv-mix-close").onclick = () => {
      mixOverlay.classList.remove("active");
      document.body.style.overflow = "";
      _clearSelection();
    };
  }

  // --- SMART COLOR ANALYZER (Center-Weighted) ---
  const _COLOR_MAP = {
    "red": "#E0115F", "maroon": "#800000", "pink": "#FFC0CB", "dusty rose": "#DCAE96",
    "blue": "#0000FF", "navy": "#000080", "sky blue": "#87CEEB", "teal": "#008080",
    "green": "#008000", "olive": "#808000", "emerald": "#50C878", "mint": "#98FF98",
    "yellow": "#FFFF00", "gold": "#FFD700", "mustard": "#E1AD01", "orange": "#FFA500",
    "black": "#0A0A0A", "white": "#FFFFFF", "grey": "#808080", "silver": "#C0C0C0",
    "beige": "#F5F5DC", "cream": "#FFFDD0", "brown": "#654321", "tan": "#D2B48C",
    "purple": "#800080", "lavender": "#E6E6FA", "violet": "#EE82EE", "magenta": "#FF00FF"
  };

  const _rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();

  async function _getHexPalette(i1, i2) {
    const sample = (item) => new Promise(res => {
      // 🥇 PRIORITY: If AI already gave a color name, use the mapped Hex for 100% accuracy
      const name = (item.color || "").toLowerCase();
      if (_COLOR_MAP[name]) return res([_COLOR_MAP[name], _COLOR_MAP[name]]);

      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = item.image_url;
      img.onload = () => {
        const cvs = document.createElement("canvas");
        cvs.width = 100; cvs.height = 100;
        const cx = cvs.getContext("2d", { willReadFrequently: true });
        cx.drawImage(img, 0, 0, 100, 100);

        try {
          // 🎯 CENTER-WEIGHTED SCAN: Skip the outer 25% (background territory)
          // Scan only the inner 50% box where the human usually stands
          const d = cx.getImageData(25, 25, 50, 50).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < d.length; i += 16) {
            r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
          }
          const hex = _rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
          res([hex, hex]);
        } catch (e) { res(["#1E1E24", "#3B3B42"]); }
      };
      img.onerror = () => res(["#1E1E24", "#3B3B42"]);
    });

    const [c1, c2] = await Promise.all([sample(i1), sample(i2)]);
    return [c1[0], c1[1], "#0D0D11", c2[0], c2[1]];
  }

  // --- EXPANDED AI FUSION ENGINE (PRO MASTER) ---
  function _getDesignFusion(i1, i2) {
    const s1 = (i1.style || "casual").toLowerCase();
    const s2 = (i2.style || "casual").toLowerCase();
    const t1 = (i1.clothing_type || "piece").toLowerCase();
    const t2 = (i2.clothing_type || "item").toLowerCase();
    const c1 = (i1.color || "neutral");
    const c2 = (i2.color || "neutral");

    // 1. ETHNIC - WESTERN HYBRID (The "Fusion" Specialist)
    if (s1.includes("ethnic") || s2.includes("ethnic")) {
      const eth = s1.includes("ethnic") ? t1 : t2;
      const west = s1.includes("ethnic") ? t2 : t1;
      return `<b>💡 DESIGN FUSION IDEA:</b> Merge the cultural draping of the <b>${eth}</b> with the sharp structuring of your <b>${west}</b>. This architectural silhouette creates a 'Modern-Heirloom' vibe that belongs on a high-fashion runway.`;
    }

    // 2. ATHLEISURE & FORMAL (The "Sport-Luxe" Archetype)
    if ((s1.includes("sport") || s1.includes("active")) && (s2.includes("formal") || s2.includes("business"))) {
      return `<b>💡 DESIGN FUSION IDEA:</b> Master the 'Sport-Luxe' trend. Use the <b>${t1}</b> as a relaxed base and sharpen it with the authority of the <b>${t2}</b>. It’s effortless, powerful, and ready for a modern creative office.`;
    }

    // 3. WINTER & LAYERED (The "Studio-Utility" Archetype)
    if (t1.includes("hoodie") || t2.includes("hoodie") || t1.includes("jacket") || t2.includes("jacket")) {
      return `<b>💡 DESIGN FUSION IDEA:</b> Go for 'Urban-Layering'. Use the <b>${c1}</b> tones as the inner core and let the heavy texture of the <b>${t2}</b> create a high-fashion protective shield. Play with open-zipper silhouettes.`;
    }

    // 4. VINTAGE & MINIMALIST (The "Retro-Metric" Archetype)
    if (s1.includes("vintage") || s2.includes("vintage")) {
      return `<b>💡 DESIGN FUSION IDEA:</b> Create a 'Retro-Metric' look. Infuse the nostalgic soul of the <b>${t1}</b> with the clean lines of the <b>${t2}</b>. Use <b>${c1}</b> and <b>${c2}</b> to create a cinematic, desaturated color palette.`;
    }

    // 5. BOHEMIAN & STREETWEAR (The "Urban-Nomad" Archetype)
    if (s1.includes("boho") || s2.includes("boho")) {
      return `<b>💡 DESIGN FUSION IDEA:</b> Execute the 'Urban-Nomad' aesthetic. Mix the free-flowing spirit of the <b>${t1}</b> with the gritty, oversized energy of your <b>${t2}</b>. Perfect for high-contrast street photography.`;
    }

    // 6. AVANT-GARDE & MONOCHROME
    if (c1.toLowerCase() === c2.toLowerCase()) {
      return `<b>💡 DESIGN FUSION IDEA:</b> Push the 'Avant-Garde' envelope. Since both pieces are <b>${c1}</b>, focus entirely on the clash of textures. Let the sheen of the <b>${t1}</b> play against the matte finish of the <b>${t2}</b> for a sculpted look.`;
    }

    // 7. DEFAULT CASUAL FUSION
    return `<b>💡 DESIGN FUSION IDEA:</b> Create a hybrid texture look. Use the <b>${c1}</b> of the <b>${t1}</b> to anchor the frame, while allowing the <b>${s2}</b> energy of the <b>${t2}</b> to dictate the movement and vibe of your final outfit.`;
  }

  function _handleSelection(item, element) {
    if (selectionBuffer.includes(item)) return;
    selectionBuffer.push(item);

    element.classList.add("card-selected");

    const status = document.getElementById("mix-status");
    const label = document.getElementById("mix-label");
    const preview = document.getElementById("mix-preview");

    if (status) {
      status.classList.add("show");
      if (label) label.textContent = `ENSEMBLING: ${selectionBuffer.length}/2 SELECTED`;
      if (preview) {
        const thumb = document.createElement("div");
        thumb.style = "width:30px;height:30px;border-radius:50%;overflow:hidden;border:2px solid #fff;margin-left:-10px;box-shadow:0 0 10px rgba(0,0,0,0.5);";
        thumb.innerHTML = `<img src="${item.image_url}" style="width:100%;height:100%;object-fit:cover">`;
        preview.appendChild(thumb);
      }
    }

    if (selectionBuffer.length === 2) {
      _buildMixMatchDOM();
      const i1 = selectionBuffer[0], i2 = selectionBuffer[1];

      // --- DYNAMIC AI SYNERGY ALGORITHM ---
      let score = 40;
      let reasons = [];

      const s1 = (i1.style || "modern").toLowerCase();
      const s2 = (i2.style || "modern").toLowerCase();

      if (s1 === s2 && s1 !== "") {
        score += 35;
        reasons.push(`A seamless <b>${i1.style}</b> aesthetic flows through both pieces.`);
      } else if ((s1 === "ethnic" && s2 !== "ethnic") || (s2 === "ethnic" && s1 !== "ethnic") || (s1 === "formal" && s2 === "sporty") || (s2 === "formal" && s1 === "sporty")) {
        score -= 25;
        reasons.push(`A difficult clash: the <b>${i1.style}</b> vibe heavily conflicts with the <b>${i2.style}</b> energy.`);
      } else {
        score += 15;
        reasons.push(`An eclectic layering of <b>${i1.style}</b> and <b>${i2.style}</b> styles creates unique tension.`);
      }

      const c1 = (i1.color || "neutral").toLowerCase();
      const c2 = (i2.color || "neutral").toLowerCase();
      const neutrals = ["black", "white", "grey", "beige", "neutral", "brown", "navy", "cream"];

      if (c1 === c2) {
        score += 20;
        reasons.push(`The monochromatic <b>${i1.color}</b> palette holds the look together.`);
      } else if (neutrals.includes(c1) || neutrals.includes(c2)) {
        score += 25;
        const grounding = neutrals.includes(c1) ? i1.color : i2.color;
        const pop = neutrals.includes(c1) ? i2.color : i1.color;
        reasons.push(`The <b>${grounding}</b> base beautifully grounds the bold <b>${pop}</b> elements.`);
      } else {
        score -= 5;
        reasons.push(`High-contrast color-blocking (<b>${i1.color} & ${i2.color}</b>) requires extreme confidence to pull off.`);
      }

      // Add a slight random variance (+/- 4%) so exact same matches don't feel entirely static if refreshed
      score = Math.max(12, Math.min(98, score + Math.floor(Math.random() * 8) - 4));

      let titleFlag = "AI SYNERGY REPORT";
      let colorFlag = "#EC4899";
      if (score < 45) {
        titleFlag = "STYLE CLASH DETECTED";
        colorFlag = "#EF4444"; // Red
      } else if (score > 85) {
        titleFlag = "EXCEPTIONAL SYNERGY";
        colorFlag = "#10B981"; // Green
      }

      // --- AI ACCESSORY RECOMMENDATION ---
      const accessories = {
        "formal": "To achieve absolute perfection, add a metallic watch or silk pocket square.",
        "streetwear": "Seal the vibe with chunky sneakers, a silver chain, or a crossbody bag.",
        "business casual": "A sleek leather belt and minimalist watch are all you need here.",
        "ethnic": "Add a traditional watch or delicate bracelets to elevate this cultural ensemble.",
        "sporty": "Throw on a structured cap or statement performance sneakers to complete it.",
      };
      const rec = accessories[s1] || accessories[s2] || "Finish this off with a minimalist watch or delicate necklace to perfect the ensemble.";
      const purchaseHTML = score > 50 ? `<div style="margin-top:20px; font-size:15px; color:rgba(255,255,255,0.6); padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);"><span style="color:#FFF;">💡 Virtual Stylist Tip:</span> ${rec}</div>` : "";

      const backdrop = document.getElementById("fv-mix-backdrop");
      if (backdrop) backdrop.style.backgroundImage = `url(${i1.image_url})`;

      const grid = document.getElementById("fv-mix-grid");
      if (grid) {
        grid.innerHTML = `
          <div class="fv-mix-card"><img src="${i1.image_url}" style="width:100%;height:100%;object-fit:cover;"></div>
          <div class="match-portal" style="background: rgba(${score < 45 ? '239,68,68' : '236,72,113'}, 0.9);">
            <small style="font-size:12px;opacity:0.8;letter-spacing:0.1em">MATCH</small>
            <strong style="font-size:38px">${score}%</strong>
          </div>
          <div class="fv-mix-card"><img src="${i2.image_url}" style="width:100%;height:100%;object-fit:cover;"></div>
        `;
      }

      const advice = document.getElementById("fv-mix-advice");
      if (advice) {
        const fusionText = _getDesignFusion(i1, i2);
        const fusionHTML = score > 40 ? `<div style="margin-top:20px; font-size:14px; color:rgba(255,255,255,0.7); background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); line-height:1.4;">${fusionText}</div>` : "";

        advice.innerHTML = `
          <div style="font-size:14px; text-transform:uppercase; letter-spacing:0.2em; color:${colorFlag}; font-weight:900; margin-bottom:15px;">${titleFlag} • ${score}% COMPATIBILITY</div>
          <p style="font-size:20px; color:rgba(255,255,255,0.85); margin:0; font-family:var(--serif); line-height: 1.5;">
            ${reasons.join(" ")}
          </p>
          ${purchaseHTML}
          ${fusionHTML}
          <div id="fv-live-palette"></div>
        `;

        // Asynchronously render the real color palette!
        _getHexPalette(i1, i2).then(colors => {
          const palCont = document.getElementById("fv-live-palette");
          if (palCont) {
            palCont.innerHTML = `
              <div class="palette-row">
                ${colors.map(c => `<div class="palette-color" style="background:${c}">${c}</div>`).join("")}
              </div>
            `;
            // Trigger animation
            setTimeout(() => { palCont.querySelector(".palette-row").style.opacity = "1"; palCont.querySelector(".palette-row").style.transform = "translateY(0)"; }, 100);
          }
        });
      }

      mixOverlay.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  }

  return {
    init: () => {
      // --- 1. ATTACH LOGOUT FIRST (Centralized) ---
      setupGlobalLogout();

      _buildBaseDOM();
      initPhysics();
      load();
      window.addEventListener("focus", load);
    },
    refresh: () => {
      lastLoadTime = 0;
      load();
    }
  };
})();

window.refreshHistory = () => App.refresh();
document.addEventListener("DOMContentLoaded", App.init);