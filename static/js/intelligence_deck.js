/**
 * FashionVision - Virtual Intelligence Deck
 * A cinematic, slide-based overlay for viewing detailed fashion reports.
 */

const IntelligenceDeck = (() => {
  let overlay, items = [], currentIdx = 0;

  function _buildDOM() {
    if (document.getElementById("deck-overlay")) return;

    const css = `
      #deck-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(10, 10, 14, 0.9);
        backdrop-filter: blur(25px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'Inter', sans-serif;
        color: #fff;
      }
      #deck-overlay.active { opacity: 1; pointer-events: all; }

      #deck-container {
        width: 100%; max-width: 1200px; height: 85vh;
        display: flex; position: relative;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 32px; overflow: hidden;
        box-shadow: 0 40px 100px rgba(0,0,0,0.5);
      }

      /* ── Left Column: Media ── */
      #deck-media {
        flex: 1.2; background: #070709; position: relative;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      #deck-media img {
        width: 100%; height: 100%; object-fit: contain;
        transition: transform 1.2s cubic-bezier(0.19, 1, 0.22, 1);
      }
      #deck-media::after {
        content: ''; position: absolute; inset: 0;
        box-shadow: inset 0 0 60px rgba(0,0,0,0.4); pointer-events: none;
      }

      /* ── Right Column: Info ── */
      #deck-info {
        flex: 1; padding: 64px; display: flex; flex-direction: column;
        background: linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 100%);
        overflow-y: auto;
      }

      #deck-header { margin-bottom: 40px; }
      #deck-season {
        font-size: 11px; font-weight: 800; color: #EC4899;
        text-transform: uppercase; letter-spacing: 0.3em; margin-bottom: 8px;
        display: block;
      }
      #deck-title {
        font-family: 'Playfair Display', serif; font-size: 3.5rem; font-weight: 900;
        line-height: 1.1; margin-bottom: 16px; font-style: italic;
      }
      #deck-desc {
        font-size: 15px; line-height: 1.8; color: rgba(255,255,255,0.5);
        margin-bottom: 32px;
      }

      .deck-section { margin-bottom: 32px; }
      .deck-label {
        font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.25);
        text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 16px;
        display: block;
      }

      .chip-grid { display: flex; flex-wrap: wrap; gap: 8px; }
      .deck-chip {
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
        padding: 8px 16px; border-radius: 99px; font-size: 11px; font-weight: 600;
        color: rgba(255,255,255,0.8);
      }

      .hashtag-row { display: flex; flex-wrap: wrap; gap: 10px; }
      .deck-hash {
        color: #EC4899; font-size: 13px; font-weight: 700;
      }

      /* ── Controls ── */
      .deck-close {
        position: absolute; top: 40px; right: 40px;
        font-size: 32px; color: rgba(255,255,255,0.4); cursor: pointer;
        background: none; border: none; z-index: 100;
        transition: all 0.3s;
      }
      .deck-close:hover { color: #fff; transform: rotate(90deg) scale(1.1); }

      .deck-nav {
        position: absolute; top: 50%; transform: translateY(-50%);
        width: 64px; height: 64px; border-radius: 50%;
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        color: #fff; cursor: pointer; display: grid; place-items: center;
        backdrop-filter: blur(10px); transition: all 0.3s; z-index: 110;
      }
      .deck-nav:hover { background: #EC4899; border-color: #EC4899; box-shadow: 0 0 30px rgba(236,72,153,0.3); }
      #deck-prev { left: -32px; }
      #deck-next { right: -32px; }

      @media (max-width: 1024px) {
        #deck-container { flex-direction: column; height: 95vh; margin: 20px; border-radius: 20px; }
        #deck-media { flex: 0.8; }
        #deck-info { padding: 40px; }
        #deck-nav-wrap { display: none; }
      }
    `;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "deck-overlay";
    overlay.innerHTML = `
      <div id="deck-container">
        <button class="deck-close">×</button>
        <button class="deck-nav" id="deck-prev">‹</button>
        <button class="deck-nav" id="deck-next">›</button>

        <div id="deck-media">
          <img id="deck-img" />
        </div>

        <div id="deck-info">
          <div id="deck-header">
            <span id="deck-season">UNIVERSAL · SS26</span>
            <h2 id="deck-title">VIRTUAL ASSET</h2>
            <p id="deck-desc"></p>
          </div>

          <div class="deck-section">
            <span class="deck-label">INTELLIGENCE ATTRIBUTES</span>
            <div class="chip-grid" id="deck-attrs"></div>
          </div>

          <div class="deck-section">
            <span class="deck-label">SOCIAL RELEVANCE</span>
            <div class="hashtag-row" id="deck-hashes"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector(".deck-close").onclick = close;
    overlay.querySelector("#deck-prev").onclick = () => _goto(currentIdx - 1);
    overlay.querySelector("#deck-next").onclick = () => _goto(currentIdx + 1);
  }

  function _render(item) {
    if (!item) return;
    const img = document.getElementById("deck-img");
    img.style.opacity = 0;
    img.src = item.image_url;
    img.onload = () => { img.style.opacity = 1; };

    document.getElementById("deck-title").textContent = item.title || "Untitled Unit";
    document.getElementById("deck-desc").textContent = item.description || "Synthesizing full analysis...";
    document.getElementById("deck-season").textContent = [item.season || "Universal", "VISION ASSET"].join(" · ").toUpperCase();

    const attrs = [item.clothing_type, item.color, item.style, item.pattern].filter(Boolean);
    document.getElementById("deck-attrs").innerHTML = attrs.map(a => `<div class="deck-chip">${a}</div>`).join("");

    const hashes = Array.isArray(item.hashtags) ? item.hashtags : [];
    document.getElementById("deck-hashes").innerHTML = hashes.map(h => `<span class="deck-hash">${h}</span>`).join("");
  }

  function _goto(idx) {
    if (!items.length) return;
    currentIdx = (idx + items.length) % items.length;
    _render(items[currentIdx]);
  }

  function open(deckSubSet, startIdx = 0) {
    _buildDOM();
    items = deckSubSet;
    currentIdx = startIdx;
    _render(items[currentIdx]);
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  return { open, close };
})();

window.IntelligenceDeck = IntelligenceDeck;
