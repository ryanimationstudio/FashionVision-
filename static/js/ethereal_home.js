/**
 * ============================================================
 * FashionVision — Ethereal Home (Anti-Gravity Runway v8.0)
 * 🚀 UPGRADED: Cinematic Interactions & Vortex Engine
 * ============================================================
 */

(function () {
  const { Engine, Runner, Events, Bodies, Body, Composite, Mouse, MouseConstraint } = window.Matter;

  // -- Config --
  const IS_MOBILE = window.innerWidth < 768;
  const MAX_CARDS = IS_MOBILE ? 6 : 14;
  const CARD_W = IS_MOBILE ? 85 : 120;
  const CARD_H = IS_MOBILE ? 120 : 165;

  const IMGS = [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80",
    "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&q=80",
    "https://images.unsplash.com/photo-1490481651871-ab68625d53f2?w=400&q=80",
    "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&q=80",
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=80",
    "https://images.unsplash.com/photo-1566106843685-43b66f2f2fd3?w=400&q=80",
    "https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=400&q=80",
    "https://images.unsplash.com/photo-1504198458649-3128b932f49e?w=400&q=80",
    "https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=400&q=80",
    "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&q=80",
    "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400&q=80",
  ];

  let engine, runner, mConstraint;
  let domBodies = [];
  let _fl, _cl, _wL, _wR;
  let mousePos = { x: 0, y: 0 };
  let isVortexActive = false;

  const stage = document.getElementById("physics-stage");

  // -- CSS Injection for Interactive Effects --
  function _injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
          .float-card { 
            position: absolute; width: ${CARD_W}px; height: ${CARD_H}px; 
            background: #000; border-radius: 4px; overflow: hidden; 
            border: 1px solid rgba(255,255,255,0.08); cursor: grab;
            transition: border-color 0.4s ease, box-shadow 0.4s ease;
          }
          .float-card::after {
              content: 'STYLE_REPORT'; position: absolute; bottom: 8px; left: 8px;
              font-size: 7px; color: #EC4899; font-weight: 900; letter-spacing: 0.2em;
              opacity: 0; transform: translateY(5px); transition: 0.3s ease;
          }
          .float-card:hover { border-color: rgba(236,72,153,0.5); box-shadow: 0 0 30px rgba(236,72,153,0.2); }
          .float-card:hover::after { opacity: 1; transform: translateY(0); }
          
          .vortex-flash {
              position: fixed; inset: 0; background: #fff; z-index: 10000;
              pointer-events: none; opacity: 0; animation: flashEffect 0.6s ease-out;
          }
          @keyframes flashEffect {
              0% { opacity: 0.8; } 100% { opacity: 0; }
          }
      `;
    document.head.appendChild(style);
  }

  function initEngine() {
    engine = Engine.create({ gravity: { x: 0, y: 0 } });
    runner = Runner.create();
    buildWalls();
    Runner.run(runner, engine);

    // ── 🌀 VORTEX & MAGNETIC HOVER ENGINE ──
    Events.on(engine, "beforeUpdate", () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const center = { x: W / 2, y: H / 2 };

      domBodies.forEach(({ body }) => {
        // 1. MAGNETIC ATTRACTION: Cards follow cursor subtly
        const dx = mousePos.x - body.position.x;
        const dy = mousePos.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 400 && !isVortexActive) {
          Body.applyForce(body, body.position, { x: dx * 0.000001, y: dy * 0.000001 });
        }

        // 2. VORTEX MODE: Pull to center then explode
        if (isVortexActive) {
          const vDx = center.x - body.position.x;
          const vDy = center.y - body.position.y;
          Body.applyForce(body, body.position, { x: vDx * 0.00008, y: vDy * 0.00008 });
        }

        // 3. ORBITAL DRIFT: Natural micro-movement
        Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.00003,
          y: (Math.random() - 0.5) * 0.00003
        });
      });
    });
  }

  function buildWalls() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const T = 180;
    const WALL = { isStatic: true, restitution: 0.95, friction: 0, label: "wall" };
    if (_fl) Composite.remove(engine.world, [_fl, _cl, _wL, _wR]);
    _fl = Bodies.rectangle(W / 2, H + T / 2, W * 3, T, WALL);
    _cl = Bodies.rectangle(W / 2, -T / 2, W * 3, T, WALL);
    _wL = Bodies.rectangle(-T / 2, H / 2, T, H * 3, WALL);
    _wR = Bodies.rectangle(W + T / 2, H / 2, T, H * 3, WALL);
    Composite.add(engine.world, [_fl, _cl, _wL, _wR]);
  }

  function initInteractions() {
    const mMouse = Mouse.create(document.body);
    mConstraint = MouseConstraint.create(engine, {
      mouse: mMouse,
      constraint: { stiffness: 0.2, damping: 0.1, render: { visible: false } }
    });
    Composite.add(engine.world, mConstraint);

    // Track mouse for Magnetic Hover
    window.addEventListener("mousemove", (e) => {
      mousePos = { x: e.clientX, y: e.clientY };
    });

    // ⚡ VORTEX BURST ON DOUBLE CLICK
    window.addEventListener("dblclick", () => {
      if (isVortexActive) return;
      isVortexActive = true;

      // 1. Pull to center for 1s
      setTimeout(() => {
        isVortexActive = false;
        // 2. Flash effect
        const flash = document.createElement("div");
        flash.className = "vortex-flash";
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 1000);

        // 3. EXPLODE!
        domBodies.forEach(({ body }) => {
          const angle = Math.random() * Math.PI * 2;
          const force = 0.05 + Math.random() * 0.15;
          Body.applyForce(body, body.position, {
            x: Math.cos(angle) * force,
            y: Math.sin(angle) * force
          });
        });
      }, 800);
    });

    Events.on(mConstraint, "startdrag", () => { document.body.style.cursor = "grabbing"; });
    Events.on(mConstraint, "enddrag", () => { document.body.style.cursor = ""; });
  }

  function initPositionSync() {
    Events.on(runner, "tick", () => {
      domBodies.forEach(({ el, body }) => {
        const { x, y } = body.position;
        el.style.transform = `translate(${x - CARD_W / 2}px, ${y - CARD_H / 2}px)`;
      });
    });
  }

  function spawnCards() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const total = Math.min(MAX_CARDS, IMGS.length);

    for (let i = 0; i < total; i++) {
      const card = document.createElement("div");
      card.className = "float-card";
      const img = document.createElement("img");
      img.src = IMGS[i];
      img.alt = "Fashion";
      img.draggable = false;
      img.style = "width:100%;height:100%;object-fit:cover;pointer-events:none;";
      card.appendChild(img);
      stage.appendChild(card);

      const sx = CARD_W + Math.random() * (W - CARD_W * 2);
      const sy = CARD_H + Math.random() * (H - CARD_H * 2);

      const body = Bodies.rectangle(sx, sy, CARD_W, CARD_H, {
        frictionAir: IS_MOBILE ? 0.05 : 0.025,
        restitution: 0.95,
        inertia: Infinity,
        label: `card-${i}`
      });

      const launchSpeed = IS_MOBILE ? 1.2 : 2.5;
      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * launchSpeed,
        y: (Math.random() - 0.5) * launchSpeed
      });

      domBodies.push({ el: card, body });
      Composite.add(engine.world, body);
    }
  }

  // Bootstrap
  document.addEventListener("DOMContentLoaded", () => {
    _injectStyles();
    initEngine();
    initInteractions();
    initPositionSync();
    spawnCards();
    window.addEventListener("resize", buildWalls);

  });
})();
