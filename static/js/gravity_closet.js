/**
 * ============================================================================
 * FashionVision — Gravity Closet
 * Physics-based interactive clothing item canvas using Matter.js.
 *
 * Public API:
 *   GravityCloset.init()                — set up engine, canvas, events
 *   GravityCloset.addItem(data)         — add a clothing item to the world
 *   GravityCloset.activate()            — "Break Reality" — launch physics mode
 *   GravityCloset.deactivate()          — exit physics mode, restore page
 *   GravityCloset.toggleGravity()       — flip gravity on/off
 *   GravityCloset.updateCanvasSize()    — re-sync walls/floor to window
 *
 * Requires: Matter.js loaded globally (window.Matter)
 * ============================================================================
 */

const GravityCloset = (() => {

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    active: false,
    gravityOn: true,
    items: [],          // { data, body, imageEl (loaded Image) }
    engine: null,
    render: null,
    runner: null,
    walls: { floor: null, left: null, right: null, ceiling: null },
    mouseConstraint: null,
    canvas: null,
    ctx: null,
    rafId: null,
    dblClickTimer: null,
  };

  // ─── Shortcuts ────────────────────────────────────────────────────────────
  const M = () => window.Matter;

  // ─── Constants ────────────────────────────────────────────────────────────
  const WALL_THICKNESS = 400;               // <-- B: increased from 80 to 400
  const ITEM_MIN_W = 90;
  const ITEM_MAX_W = 160;
  const FRICTION = 0.5;
  const RESTITUTION = 0.6;
  const GRAVITY_Y = 1.2;
  const FLOAT_FORCE_MAG = 0.0006;   // upward nudge when gravity is off

  // ─── DOM Helpers ──────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

  // ─────────────────────────────────────────────────────────────────────────
  // initPhysics()
  // Creates the Matter.js Engine, Runner, and a bare custom Canvas renderer.
  // We roll our own renderer using ctx.drawImage() for sprite support and
  // 60fps performance with many items.
  // ─────────────────────────────────────────────────────────────────────────
  function initPhysics() {
    if (!M()) {
      console.error("[GravityCloset] Matter.js not loaded.");
      return false;
    }

    const { Engine, Runner, Events, MouseConstraint, Mouse, Composite } = M();

    // Engine
    state.engine = Engine.create();
    state.engine.gravity.y = GRAVITY_Y;

    // Runner (decoupled from rendering)
    state.runner = Runner.create({ delta: 1000 / 60 });

    // Canvas
    const wrap = $("gravity-canvas-wrap");
    state.canvas = $("gravity-canvas");
    state.canvas.width = window.innerWidth;
    state.canvas.height = window.innerHeight;
    state.ctx = state.canvas.getContext("2d");

    // Mouse Constraint (for drag/throw)
    const mouse = Mouse.create(state.canvas);
    state.mouseConstraint = MouseConstraint.create(state.engine, {
      mouse,
      constraint: {
        stiffness: 0.18,
        damping: 0.1,
        render: { visible: false },
      },
    });

    // Link mouse element correctly for interaction
    state.mouseConstraint.mouse.element = state.canvas;

    // Listen for dblclick to open metadata modal
    state.canvas.addEventListener("dblclick", _onDoubleClick);

    // Prevent context menu on canvas
    state.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    _createBoundaries();

    // Add mouse constraint to world ONCE
    Composite.add(state.engine.world, state.mouseConstraint);

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // updateCanvasSize()
  // Resizes canvas and repositions boundary walls to match window.
  // ─────────────────────────────────────────────────────────────────────────
  function updateCanvasSize() {
    if (!state.engine) return;
    const W = window.innerWidth;
    const H = window.innerHeight;

    state.canvas.width = W;
    state.canvas.height = H;

    const { Body } = M();
    const t = WALL_THICKNESS;

    // Reposition each wall
    Body.setPosition(state.walls.floor, { x: W / 2, y: H + t / 2 });
    Body.setPosition(state.walls.ceiling, { x: W / 2, y: -t / 2 });
    Body.setPosition(state.walls.left, { x: -t / 2, y: H / 2 });
    Body.setPosition(state.walls.right, { x: W + t / 2, y: H / 2 });
  }

  // ─── Private: create invisible boundary walls ─────────────────────────────
  function _createBoundaries() {
    const { Bodies, Composite } = M();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const t = WALL_THICKNESS;
    const opts = { isStatic: true, label: "wall", friction: 0.4, restitution: 0.3 };

    state.walls.floor = Bodies.rectangle(W / 2, H + t / 2, W + t * 2, t, opts);
    state.walls.ceiling = Bodies.rectangle(W / 2, -t / 2, W + t * 2, t, opts);
    state.walls.left = Bodies.rectangle(-t / 2, H / 2, t, H + t * 2, opts);
    state.walls.right = Bodies.rectangle(W + t / 2, H / 2, t, H + t * 2, opts);

    Composite.add(state.engine.world, [
      state.walls.floor,
      state.walls.ceiling,
      state.walls.left,
      state.walls.right,
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // addItem(data)
  // data: { image_url, title, description, hashtags, clothing_type,
  //         color, pattern, style, season, id }
  // Registers the item and spawns it if the closet is already active.
  // ─────────────────────────────────────────────────────────────────────────
  function addItem(data) {
    if (!data || !data.image_url) return;

    // Pre-load image for sprite rendering
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = data.image_url;

    const record = { data, imageEl: img, body: null };
    state.items.push(record);

    // Show the trigger button now that there are items
    const triggerBtn = $("gc-trigger-btn");
    if (triggerBtn) {
      triggerBtn.style.display = "flex";
      triggerBtn.classList.add("glowing");
    }

    // A: Wait for image to load before creating physics body
    const createBodyIfNeeded = () => {
      if (state.active && !record.body) {
        _spawnBody(record);
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      // Already loaded
      createBodyIfNeeded();
    } else {
      img.onload = () => {
        createBodyIfNeeded();
      };
      img.onerror = () => {
        console.warn(`[GravityCloset] Failed to load image: ${data.image_url}`);
        // Still create a body (with placeholder)
        createBodyIfNeeded();
      };
    }
  }

  // ─── Private: create a Matter.js body and drop it ─────────────────────────
  function _spawnBody(record) {
    const { Bodies, Body, Composite } = M();
    const W = window.innerWidth;

    // Determine body size from image natural dimensions (or default)
    const img = record.imageEl;
    let bW = ITEM_MAX_W;
    let bH = ITEM_MAX_W;

    // If image already loaded, use aspect ratio
    if (img.complete && img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalHeight / img.naturalWidth;
      bW = ITEM_MAX_W;
      bH = Math.round(bW * ratio);
      bH = Math.max(bH, ITEM_MIN_W);
    }

    // Random x, spawn from above viewport
    const spawnX = Math.random() * (W - bW * 2) + bW;
    const spawnY = -(bH + 20);

    const body = Bodies.rectangle(spawnX, spawnY, bW, bH, {
      label: "clothing",
      friction: FRICTION,
      restitution: RESTITUTION,
      frictionAir: 0.012,
      density: 0.0012,
      chamfer: { radius: 8 },
      render: { visible: false },   // we handle rendering manually
    });

    // Attach metadata reference to body for dblclick lookup
    body._fvRecord = record;
    record.body = body;
    record._bW = bW;
    record._bH = bH;

    // Small random initial spin
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12);

    Composite.add(state.engine.world, [body]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // activate()
  // "Break Reality" — transitions into physics mode.
  // ─────────────────────────────────────────────────────────────────────────
  function activate() {
    if (state.active) return;
    if (!state.engine && !initPhysics()) return;

    // C: Screen shake effect
    document.body.classList.add('screen-shatter');
    setTimeout(() => {
      document.body.classList.remove('screen-shatter');
    }, 400);

    state.active = true;

    // Show canvas overlay
    const wrap = $("gravity-canvas-wrap");
    wrap.classList.add("active");

    // RE-SYNC MOUSE: Ensure Matter.js knows about the now-visible canvas
    if (state.mouseConstraint && state.mouseConstraint.mouse) {
      const { Mouse } = M();
      Mouse.setElement(state.mouseConstraint.mouse, state.canvas);
      // Reset mouse state to prevent "sticky" clicks from previous sessions
      state.mouseConstraint.mouse.button = -1;
    }

    // Ambient bg
    const ambient = $("gc-ambient");
    if (ambient) ambient.classList.add("active");

    // HUD
    const hud = $("gc-hud");
    if (hud) hud.classList.add("active");

    // Exit hint
    const hint = $("gc-exit-hint");
    if (hint) hint.classList.add("active");

    // Spawn all existing items (now with loaded images)
    state.items.forEach(record => {
      if (!record.body) _spawnBody(record);
    });

    // Update item count
    _updateItemCount();

    // Start physics runner
    M().Runner.run(state.runner, state.engine);

    // Start custom render loop
    _startRenderLoop();

    // Trigger btn update
    const btn = $("gc-trigger-btn");
    if (btn) {
      btn.textContent = "✕ Exit Closet";
      btn.classList.remove("glowing");
      btn.onclick = deactivate;
    }

    // Window resize
    window.addEventListener("resize", updateCanvasSize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // deactivate()
  // Exits physics mode, stops animation loop.
  // ─────────────────────────────────────────────────────────────────────────
  function deactivate() {
    if (!state.active) return;
    state.active = false;

    // Stop runner
    M().Runner.stop(state.runner);

    // Stop render loop
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;

    // Hide canvas
    const wrap = $("gravity-canvas-wrap");
    wrap.classList.remove("active");

    // Ambient
    const ambient = $("gc-ambient");
    if (ambient) ambient.classList.remove("active");

    // HUD
    const hud = $("gc-hud");
    if (hud) hud.classList.remove("active");

    // Hint
    const hint = $("gc-exit-hint");
    if (hint) hint.classList.remove("active");

    // Remove all bodies so next activation re-spawns fresh
    const { Composite } = M();
    state.items.forEach(r => {
      if (r.body) {
        Composite.remove(state.engine.world, r.body);
        r.body = null;
      }
    });

    // Reset trigger button
    const btn = $("gc-trigger-btn");
    if (btn) {
      btn.textContent = "🕳️ Break Reality";
      btn.classList.add("glowing");
      btn.onclick = activate;
    }

    // Clear gravity toggle button state
    const gravBtn = $("gc-gravity-btn");
    if (gravBtn) gravBtn.classList.remove("active-state");
    state.gravityOn = true;
    state.engine.gravity.y = GRAVITY_Y;

    window.removeEventListener("resize", updateCanvasSize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // toggleGravity()
  // Flip gravity on/off. When off, items get random upward nudges (float).
  // ─────────────────────────────────────────────────────────────────────────
  function toggleGravity() {
    if (!state.engine) return;
    state.gravityOn = !state.gravityOn;
    state.engine.gravity.y = state.gravityOn ? GRAVITY_Y : 0;

    const btn = $("gc-gravity-btn");
    if (btn) {
      btn.innerHTML = state.gravityOn
        ? "🌍 Gravity: ON"
        : "🚀 Gravity: OFF";
      btn.classList.toggle("active-state", !state.gravityOn);
    }

    // Apply a pop to all bodies on toggle
    const { Body } = M();
    state.items.forEach(r => {
      if (!r.body) return;
      const fx = (Math.random() - 0.5) * 0.04;
      const fy = state.gravityOn ? (Math.random() * 0.04) : -(Math.random() * 0.06 + 0.02);
      Body.applyForce(r.body, r.body.position, { x: fx, y: fy });
    });
  }

  // ─── Private: scatter / explode all items ─────────────────────────────────
  function _scatterAll() {
    if (!state.engine) return;
    const { Body } = M();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    state.items.forEach(r => {
      if (!r.body) return;
      const dx = r.body.position.x - cx;
      const dy = r.body.position.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = 0.12 + Math.random() * 0.1;
      Body.applyForce(r.body, r.body.position, {
        x: (dx / dist) * strength,
        y: (dy / dist) * strength,
      });
      Body.setAngularVelocity(r.body, (Math.random() - 0.5) * 0.5);
    });
  }

  // ─── Private: render loop using requestAnimationFrame ─────────────────────
  function _startRenderLoop() {
    const ctx = state.ctx;

    const loop = () => {
      if (!state.active) return;
      state.rafId = requestAnimationFrame(loop);

      const W = state.canvas.width;
      const H = state.canvas.height;

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Floating nudge when gravity off
      if (!state.gravityOn) {
        const { Body } = M();
        state.items.forEach(r => {
          if (!r.body) return;
          Body.applyForce(r.body, r.body.position, {
            x: (Math.random() - 0.5) * FLOAT_FORCE_MAG,
            y: -(Math.random() * FLOAT_FORCE_MAG + FLOAT_FORCE_MAG * 0.5),
          });
        });
      }

      // Detect mouse hovering over a body for cursor change
      const mPos = state.mouseConstraint?.mouse?.position;
      let isHovering = false;

      // Draw each item
      state.items.forEach(record => {
        const { body, imageEl, _bW, _bH } = record;
        if (!body || !_bW) return;

        const pos = body.position;
        const angle = body.angle;
        const hw = _bW / 2;
        const hh = _bH / 2;

        // Hover check for cursor change
        if (mPos) {
          const dx = mPos.x - pos.x;
          const dy = mPos.y - pos.y;
          // Simple axis-aligned bounding box for hover (close enough)
          if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            isHovering = true;
          }
        }

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);

        // Shadow
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;

        // Clip to rounded rect for the sprite
        _roundedRect(ctx, -hw, -hh, _bW, _bH, 10);
        ctx.clip();

        // Draw image if loaded, else gradient placeholder
        if (imageEl.complete && imageEl.naturalWidth > 0) {
          ctx.drawImage(imageEl, -hw, -hh, _bW, _bH);
        } else {
          const grad = ctx.createLinearGradient(-hw, -hh, hw, hh);
          grad.addColorStop(0, "#1e1e2a");
          grad.addColorStop(1, "#2a1a3a");
          ctx.fillStyle = grad;
          ctx.fill();
          // Emoji placeholder
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.font = `${_bW * 0.5}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("👗", 0, 0);
        }

        ctx.restore();

        // Glossy overlay
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        _roundedRect(ctx, -hw, -hh, _bW, _bH, 10);
        ctx.clip();
        const gloss = ctx.createLinearGradient(-hw, -hh, -hw, 0);
        gloss.addColorStop(0, "rgba(255,255,255,0.12)");
        gloss.addColorStop(0.5, "rgba(255,255,255,0.04)");
        gloss.addColorStop(1, "transparent");
        ctx.fillStyle = gloss;
        ctx.fill();

        // Thin border
        _roundedRect(ctx, -hw, -hh, _bW, _bH, 10);
        ctx.strokeStyle = "rgba(192,132,252,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        // Double-click ring pulse on hover
        if (mPos) {
          const dx = mPos.x - pos.x;
          const dy = mPos.y - pos.y;
          if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            ctx.save();
            ctx.translate(pos.x, pos.y);
            _roundedRect(ctx, -hw, -hh, _bW, _bH, 10);
            ctx.strokeStyle = "rgba(244,114,182,0.5)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }
        }
      });

      // Update cursor based on hover
      if (state.canvas) {
        state.canvas.style.cursor = isHovering ? "pointer" : "default";
      }

      // Update count
      _updateItemCount();
    };

    state.rafId = requestAnimationFrame(loop);
  }

  // ─── Private: rounded rect path helper ────────────────────────────────────
  function _roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ─── Private: pick the body under the mouse click point ───────────────────
  function _bodyAtPoint(px, py) {
    const { Query } = M();
    const point = { x: px, y: py };
    const found = Query.point(
      state.items.filter(r => r.body).map(r => r.body),
      point
    );
    return found.length > 0 ? found[0] : null;
  }

  // ─── Private: double-click handler ────────────────────────────────────────
  function _onDoubleClick(e) {
    const rect = state.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const body = _bodyAtPoint(px, py);
    if (!body || !body._fvRecord) return;
    _openModal(body._fvRecord.data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Modal
  // ─────────────────────────────────────────────────────────────────────────
  function _openModal(data) {
    const backdrop = $("gc-modal-backdrop");
    if (!backdrop) return;

    // Image
    const imgEl = $("gc-modal__img");
    if (imgEl) {
      imgEl.src = data.image_url || "";
      imgEl.alt = data.title || "Fashion item";
      imgEl.style.display = data.image_url ? "" : "none";
    }

    // Title
    const titleEl = $("gc-modal__title");
    if (titleEl) titleEl.textContent = data.title || "Untitled";

    // Attributes
    const attrsEl = $("gc-modal__attrs");
    if (attrsEl) {
      const attributes = [
        { label: "Type", value: data.clothing_type },
        { label: "Color", value: data.color },
        { label: "Pattern", value: data.pattern },
        { label: "Style", value: data.style },
        { label: "Season", value: data.season },
        { label: "Occasion", value: data.occasion },
        { label: "Fit", value: data.fit }
      ];

      attrsEl.innerHTML = attributes
        .filter(a => a.value)
        .map(a => `
          <div class="gc-attr-chip">
            <span class="gc-attr-chip__label">${a.label}:</span>
            <span class="gc-attr-chip__value">${a.value || "—"}</span>
          </div>`)
        .join("") || '<p class="text-dim">No physical attributes detected.</p>';
    }

    // Description
    const descEl = $("gc-modal__description");
    if (descEl) descEl.textContent = data.description || "No description available.";

    // Hashtags
    const hashEl = $("gc-modal__hashtags");
    if (hashEl) {
      let tags = [];
      if (Array.isArray(data.hashtags)) {
        tags = data.hashtags;
      } else if (typeof data.hashtags === 'string') {
        tags = data.hashtags.split(/\s+/).filter(Boolean);
      }

      hashEl.innerHTML = tags.length > 0
        ? tags.slice(0, 15).map(t => `<span class="gc-hash-pill">${t}</span>`).join("")
        : '<p class="text-dim">No hashtags generated.</p>';
    }

    backdrop.classList.add("open");
  }

  function _closeModal() {
    const backdrop = $("gc-modal-backdrop");
    if (backdrop) backdrop.classList.remove("open");
  }

  // ─── Private: update the item count badge ─────────────────────────────────
  function _updateItemCount() {
    const el = $("gc-item-count");
    if (el) el.textContent = `${state.items.length} item${state.items.length !== 1 ? "s" : ""}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // init()
  // Wires up all DOM elements and events. Call once on page load.
  // ─────────────────────────────────────────────────────────────────────────
  function init() {
    // "Break Reality" trigger button
    const triggerBtn = $("gc-trigger-btn");
    if (triggerBtn) triggerBtn.onclick = activate;

    // Gravity toggle button
    const gravBtn = $("gc-gravity-btn");
    if (gravBtn) gravBtn.onclick = toggleGravity;

    // Scatter button
    const scatterBtn = $("gc-scatter-btn");
    if (scatterBtn) scatterBtn.onclick = _scatterAll;

    // Close / exit button in HUD
    const exitBtn = $("gc-exit-btn");
    if (exitBtn) exitBtn.onclick = deactivate;

    // Modal close
    const closeBtn = $("gc-modal__close");
    if (closeBtn) closeBtn.onclick = _closeModal;

    const backdrop = $("gc-modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) _closeModal();
      });
    }

    // Keyboard: Escape deactivates
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("gc-modal-backdrop")?.classList.contains("open")) {
          _closeModal();
        } else if (state.active) {
          deactivate();
        }
      }
    });

    // Window resize
    window.addEventListener("resize", () => {
      if (state.active) updateCanvasSize();
    });

    // Lazy-init the physics engine NOW (so first activation is instant)
    initPhysics();

    console.log("[GravityCloset] Initialized. Call GravityCloset.addItem(data) to add items.");
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { init, addItem, activate, deactivate, toggleGravity, updateCanvasSize };

})();

// Auto-init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", GravityCloset.init);
} else {
  GravityCloset.init();
}

export default GravityCloset;