/**
 * ============================================================================
 * FashionVision — PhysicsHero
 * Neo-Brutalist background physics for the landing page.
 *
 * Public API:
 *   PhysicsHero.init()          — boot the engine, spawn charms, start loop
 *   PhysicsHero.destroy()       — tear down engine and canvas
 *   PhysicsHero.setGravityHigh()— CTA hover: items crash to floor
 *   PhysicsHero.resetGravity()  — CTA un-hover: back to float
 *
 * Requires: Matter.js on window.Matter
 * ============================================================================
 */

const PhysicsHero = (() => {

  // ─── Config ────────────────────────────────────────────────────────────────
  const CFG = {
    CHARM_COUNT:      18,
    GRAVITY_FLOAT:    0,          // zero gravity — free float
    GRAVITY_HIGH:     3.2,        // CTA hover: heavy fall
    REPULSION_RADIUS: 140,        // px — mouse repulsion field
    REPULSION_FORCE:  0.016,      // strength
    FLOAT_NUDGE:      0.00025,    // random drift force magnitude
    WALL_T:           60,         // invisible wall thickness
    FRICTION:         0.01,
    RESTITUTION:      0.55,
    FRICTION_AIR:     0.008,
    SIZE_MIN:         34,
    SIZE_MAX:         68,
    FPS:              60,
  };

  // Fashion charms — emoji rendered onto canvas bodies
  const CHARMS = [
    "👗","👠","👜","🧥","👒","🕶️","👟","💍","🧣","🎀",
    "👔","🩱","🩴","🧤","💄","🪡","🧢","🩻",
  ];

  // Neo-Brutalist palette for body tints
  const TINTS = [
    "rgba(255,0,127,0.13)",
    "rgba(255,255,255,0.08)",
    "rgba(0,0,0,0.18)",
    "rgba(255,0,127,0.07)",
    "rgba(255,255,255,0.05)",
  ];

  // ─── State ─────────────────────────────────────────────────────────────────
  let engine, runner, canvas, ctx, rafId, mousePos;
  let bodies = [];
  let isHighGravity = false;
  let resizeTimer = null;

  // ─── Matter.js shorthand ───────────────────────────────────────────────────
  const M = () => window.Matter;

  // ─────────────────────────────────────────────────────────────────────────
  // init()
  // ─────────────────────────────────────────────────────────────────────────
  function init() {
    if (!M()) { console.error("[PhysicsHero] Matter.js not loaded."); return; }

    canvas = document.getElementById("hero-canvas");
    if (!canvas) { console.error("[PhysicsHero] #hero-canvas not found."); return; }
    ctx = canvas.getContext("2d");

    _resize();

    // Engine — zero gravity to start
    engine = M().Engine.create({ gravity: { y: CFG.GRAVITY_FLOAT } });
    runner = M().Runner.create({ delta: 1000 / CFG.FPS });

    _buildWalls();
    _spawnCharms();
    _addMouseConstraint();

    M().Runner.run(runner, engine);
    _startLoop();
    _bindEvents();

    console.log("[PhysicsHero] Initialized with", bodies.length, "charms.");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _resize() — sync canvas dimensions to window
  // ─────────────────────────────────────────────────────────────────────────
  function _resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // ─── Walls ─────────────────────────────────────────────────────────────────
  let wallBodies = { floor: null, left: null, right: null, ceiling: null };

  function _buildWalls() {
    const { Bodies, Composite } = M();
    const W = canvas.width, H = canvas.height, t = CFG.WALL_T;
    const opts = { isStatic: true, label: "wall", friction: 0.3, restitution: 0.4 };

    wallBodies.floor   = Bodies.rectangle(W / 2, H + t / 2, W * 2, t, opts);
    wallBodies.ceiling = Bodies.rectangle(W / 2, -t / 2,    W * 2, t, opts);
    wallBodies.left    = Bodies.rectangle(-t / 2, H / 2,    t, H * 2, opts);
    wallBodies.right   = Bodies.rectangle(W + t / 2, H / 2, t, H * 2, opts);

    Composite.add(engine.world, Object.values(wallBodies));
  }

  function _updateWalls() {
    if (!engine) return;
    const { Body } = M();
    const W = canvas.width, H = canvas.height, t = CFG.WALL_T;

    Body.setPosition(wallBodies.floor,   { x: W / 2,     y: H + t / 2 });
    Body.setPosition(wallBodies.ceiling, { x: W / 2,     y: -t / 2    });
    Body.setPosition(wallBodies.left,    { x: -t / 2,    y: H / 2     });
    Body.setPosition(wallBodies.right,   { x: W + t / 2, y: H / 2     });
  }

  // ─── Spawn charms ──────────────────────────────────────────────────────────
  function _spawnCharms() {
    const { Bodies, Body, Composite } = M();
    const W = canvas.width, H = canvas.height;

    for (let i = 0; i < CFG.CHARM_COUNT; i++) {
      const size   = CFG.SIZE_MIN + Math.random() * (CFG.SIZE_MAX - CFG.SIZE_MIN);
      const x      = size + Math.random() * (W - size * 2);
      const y      = size + Math.random() * (H - size * 2);
      const emoji  = CHARMS[i % CHARMS.length];
      const tint   = TINTS[Math.floor(Math.random() * TINTS.length)];

      // Alternate between circle and rectangle bodies for variety
      const body = (i % 3 === 0)
        ? Bodies.circle(x, y, size / 2, {
            friction:    CFG.FRICTION,
            restitution: CFG.RESTITUTION,
            frictionAir: CFG.FRICTION_AIR,
            label: "charm",
          })
        : Bodies.rectangle(x, y, size, size, {
            friction:    CFG.FRICTION,
            restitution: CFG.RESTITUTION,
            frictionAir: CFG.FRICTION_AIR,
            chamfer: { radius: size * 0.18 },
            label: "charm",
          });

      // Random initial velocity for floating feel
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 1.8,
        y: (Math.random() - 0.5) * 1.8,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);

      // Store extra rendering data
      body._emoji = emoji;
      body._tint  = tint;
      body._size  = size;

      bodies.push(body);
      Composite.add(engine.world, body);
    }
  }

  // ─── Mouse constraint (click + drag + toss) ────────────────────────────────
  function _addMouseConstraint() {
    const { Mouse, MouseConstraint, Composite } = M();
    const mouse = Mouse.create(canvas);

    const mc = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.2,
        damping:   0.12,
        render: { visible: false },
      },
      // Only allow dragging charm bodies, not walls
      collisionFilter: { mask: 0xFFFFFFFF },
    });

    // Only match charm bodies
    mc.body = null;
    Composite.add(engine.world, mc);
  }

  // ─── Render loop ───────────────────────────────────────────────────────────
  function _startLoop() {
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const W = canvas.width, H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // Apply physics each frame
      _applyFloatNudge();
      if (mousePos) _applyRepulsion();

      // Draw charms
      bodies.forEach(b => _drawCharm(b));
    };
    rafId = requestAnimationFrame(loop);
  }

  // ─── Per-frame forces ──────────────────────────────────────────────────────

  function _applyFloatNudge() {
    if (isHighGravity) return;            // no nudge when falling
    const { Body } = M();
    bodies.forEach(b => {
      Body.applyForce(b, b.position, {
        x: (Math.random() - 0.5) * CFG.FLOAT_NUDGE,
        y: (Math.random() - 0.5) * CFG.FLOAT_NUDGE,
      });
    });
  }

  function _applyRepulsion() {
    if (!mousePos) return;
    const { Body } = M();
    const r = CFG.REPULSION_RADIUS;
    const f = CFG.REPULSION_FORCE;

    bodies.forEach(b => {
      const dx = b.position.x - mousePos.x;
      const dy = b.position.y - mousePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < r && dist > 1) {
        const strength = (1 - dist / r) * f;
        Body.applyForce(b, b.position, {
          x: (dx / dist) * strength,
          y: (dy / dist) * strength,
        });
      }
    });
  }

  // ─── Draw a single charm ───────────────────────────────────────────────────
  function _drawCharm(b) {
    const pos   = b.position;
    const angle = b.angle;
    const size  = b._size;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Tinted background square/circle
    ctx.globalAlpha = 0.65;
    ctx.fillStyle   = b._tint;

    // Draw shape outline (Neo-Brutalist 2px border)
    _drawBodyShape(b, size);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Emoji
    ctx.globalAlpha = 0.72;
    ctx.font        = `${size * 0.62}px serif`;
    ctx.textAlign   = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor  = "rgba(255,0,127,0.25)";
    ctx.shadowBlur   = 12;
    ctx.fillText(b._emoji, 0, 0);

    ctx.restore();
  }

  function _drawBodyShape(b, size) {
    const verts = b.vertices;
    if (verts && verts.length > 2) {
      // Use actual vertices (rectangle/polygon)
      const cx = b.position.x;
      const cy = b.position.y;
      ctx.beginPath();
      ctx.moveTo(verts[0].x - cx, verts[0].y - cy);
      for (let i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i].x - cx, verts[i].y - cy);
      }
      ctx.closePath();
    } else {
      // Circle fallback
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.closePath();
    }
  }

  // ─── Gravity modes ─────────────────────────────────────────────────────────

  function setGravityHigh() {
    if (!engine || isHighGravity) return;
    isHighGravity = true;
    engine.gravity.y = CFG.GRAVITY_HIGH;

    // Give each body a random lateral nudge for visual chaos
    const { Body } = M();
    bodies.forEach(b => {
      Body.applyForce(b, b.position, {
        x: (Math.random() - 0.5) * 0.08,
        y: 0,
      });
    });
  }

  function resetGravity() {
    if (!engine || !isHighGravity) return;
    isHighGravity = false;
    engine.gravity.y = CFG.GRAVITY_FLOAT;

    // Float items back up
    const { Body } = M();
    const H = canvas.height;
    bodies.forEach(b => {
      Body.setVelocity(b, {
        x: (Math.random() - 0.5) * 2,
        y: -(Math.random() * 6 + 3),   // upward burst
      });
    });
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  function _bindEvents() {
    // Track mouse position (for repulsion)
    window.addEventListener("mousemove", (e) => {
      mousePos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseleave", () => { mousePos = null; });

    // CTA button hover → gravity mode
    const cta = document.getElementById("hero-cta");
    if (cta) {
      cta.addEventListener("mouseenter", setGravityHigh);
      cta.addEventListener("mouseleave", resetGravity);
    }

    // Resize — debounced
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        _resize();
        _updateWalls();
      }, 120);
    });

    // Touch move support
    window.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      mousePos = { x: t.clientX, y: t.clientY };
    }, { passive: true });
  }

  // ─── Destroy ───────────────────────────────────────────────────────────────
  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    if (runner) M().Runner.stop(runner);
    if (engine) M().Engine.clear(engine);
    bodies = [];
    engine = runner = canvas = ctx = rafId = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  return { init, destroy, setGravityHigh, resetGravity };

})();

// Auto-init on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", PhysicsHero.init);
} else {
  PhysicsHero.init();
}
