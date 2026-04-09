const RunwayMode = (() => {

  // ── Session State ─────────────────────────────────────────────────────────
  let overlay, imgEl, titleEl, descEl, metaEl, counterEl, uploadInput;
  let searchInput, audioBtn, weatherBadge;
  let originalItems = [], items = [], currentIdx = 0, autoTimer = null;
  let sessionUploads = [];
  let isMuted = true;
  let scrollLock = false;
  let touchStartX = 0; // Added for Mobile Swipe

  // Use a more stable cinematic atmospheric track (No-copyright-music fallback)
  const audio = new Audio("https://cdn.pixabay.com/audio/2021/11/25/audio_91b164f99b.mp3");
  audio.loop = true;
  audio.volume = 0.4; // Lower default volume for premium feel

  const SLIDE_DURATION = 8000;

  let isPaused = false;


  function _buildDOM() {
    if (document.getElementById("runway-overlay")) return;
    console.log("RunwayMode: HUD v4 (Mobile-Ready) Initializing...");

    const css = `
      #runway-overlay {
        position: fixed; inset: 0; z-index: 10000000;
        background: #000; display: flex; align-items: center; justify-content: center;
        font-family: 'Inter', sans-serif; opacity: 0; pointer-events: none; transition: opacity 0.8s ease;
      }
      #runway-overlay.active { opacity: 1; pointer-events: all; }

      #runway-slide {
        position: relative; width: 100vw; height: 100vh;
        display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;
      }
      #runway-slide::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 30%, transparent 60%);
        z-index: 15; pointer-events: none;
      }
      
      #runway-backdrop {
        position: absolute; inset: -50px; width: calc(100% + 100px); height: calc(100% + 100px);
        object-fit: cover; filter: blur(100px) brightness(0.25); opacity: 0.7; z-index: 1; transition: opacity 1s ease;
      }

      #runway-img-wrap {
        position: relative; z-index: 10;
        height: 55vh; max-width: 85vw; aspect-ratio: auto; margin-top: 90px;
        display: flex; align-items: center; justify-content: center;
        transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 40px 100px rgba(0,0,0,1);
        border-radius: 40px; overflow: hidden;
        border: 2px solid rgba(255,255,255,0.08);
        background: #000;
      }
      #runway-img { 
        width: 100%; height: 100%; object-fit: contain; 
        transition: opacity 0.8s ease, transform 6s linear, filter 0.8s ease; 
        opacity: 0; transform: scale(1.05); filter: blur(20px);
      }
      #runway-img.loaded { opacity: 1; transform: scale(1.15); filter: blur(0px); } 
      
      .runway-glass-overlay {
        position: absolute; inset: 0; z-index: 5;
        background: radial-gradient(circle at 50% 50%, transparent 20%, rgba(0,0,0,0.4) 100%);
        pointer-events: none;
      }

      /* 🔫 LASER SCANNER */
      #runway-scan-line {
        position: absolute; top: 0; left: 0; width: 100%; height: 6px;
        background: linear-gradient(to right, transparent, #00F3FF, #EC4899, #00F3FF, transparent);
        box-shadow: 0 0 30px #00F3FF, 0 0 10px #EC4899; z-index: 20;
        opacity: 0; pointer-events: none;
      }
      .scanning { animation: scanEffect 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
      @keyframes scanEffect {
        0% { top: 0%; opacity: 0; }
        20% { opacity: 1; }
        80% { opacity: 1; }
        100% { top: 100%; opacity: 0; }
      }

      /* 💫 GLOWING MOUSE ORB */
      #runway-cursor-orb {
        position: fixed; width: 300px; height: 300px;
        background: radial-gradient(circle, rgba(236,72,153,0.1) 0%, transparent 70%);
        border-radius: 50%; pointer-events: none; z-index: 2;
        transform: translate(-50%, -50%); transition: left 0.1s ease-out, top 0.1s ease-out;
        mix-blend-mode: screen;
      }

      .runway-hud-top {
        position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
        width: 94%; max-width: 1400px;
        display: flex; justify-content: space-between; align-items: center; z-index: 1000;
        background: rgba(255,255,255,0.02); backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
        border: 1px solid rgba(255,255,255,0.08); padding: 10px 24px; border-radius: 100px;
      }

      #runway-search-wrap { position: relative; width: 220px; border-right: 1px solid rgba(255,255,255,0.1); }
      #runway-search { width: 100%; background: none; border: none; padding: 5px 38px; color: #fff; font-size: 13px; font-weight: 500; }
      #runway-search:focus { outline: none; }
      #runway-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; color: rgba(255,255,255,0.4); }

      #runway-counter { 
        font-size: 11px; font-weight: 800; letter-spacing: 0.3em; color: #EC4899; 
        background: rgba(236,72,153,0.1); border: 1px solid rgba(236,72,153,0.2); padding: 6px 18px; border-radius: 40px; white-space: nowrap;
      }

      .runway-hud-right { display: flex; align-items: center; gap: 14px; }
      
      #runway-upload-btn, #runway-weather {
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 60px; height: 36px; padding: 0 16px; 
        color: #fff; font-size: 9px; font-weight: 800; text-transform: uppercase;
        letter-spacing: 0.12em; display: flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; transition: 0.3s;
      }
      #runway-upload-btn:hover { background: #fff; color: #000; }

      #runway-text-block {
        position: relative; margin-top: 32px;
        width: 90%; max-width: 800px; z-index: 200;
        text-align: center; pointer-events: none;
      }
      #runway-meta { font-size: 9px; font-weight: 800; letter-spacing: 0.4em; text-transform: uppercase; color: #EC4899; margin-bottom: 12px; }
      #runway-title {
        font-family: 'Playfair Display', serif; font-size: clamp(1.8rem, 3.2vw, 2.6rem);
        font-weight: 900; font-style: italic; color: #fff; line-height: 1.1; margin: 0 0 8px;
        text-shadow: 0 10px 40px rgba(0,0,0,0.8);
      }
      #runway-desc { font-size: 14px; font-weight: 400; color: rgba(255,255,255,0.4); max-width: 600px; margin: 0 auto; line-height: 1.5; min-height: 3em; }

      .runway-ctrl {
        position: absolute; top: 50%; transform: translateY(-50%);
        z-index: 50; color: rgba(255,255,255,0.3); font-size: 32px;
        background: none; border: none; cursor: pointer; transition: all 0.3s;
      }
      .runway-ctrl:hover { color: #fff; transform: translateY(-50%) scale(1.2); }
      #runway-prev { left: 40px; }
      #runway-next { right: 40px; }

      #runway-progress { position: fixed; bottom: 0; left: 0; height: 4px; background: rgba(255,255,255,0.05); width: 100%; z-index: 1000; }
      #runway-progress-bar { height: 100%; width: 0%; background: #EC4899; transition: width linear; }

      #runway-upload-toast {
        position: absolute; bottom: 40px; right: 40px; z-index: 2000;
        background: rgba(236, 72, 153, 0.95); color: #fff; 
        padding: 12px 32px; border-radius: 100px; 
        font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
        backdrop-filter: blur(10px); box-shadow: 0 20px 40px rgba(236,72,153,0.3);
        opacity: 0; pointer-events: none;
        transform: translateX(40px); transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #runway-upload-toast.show { opacity: 1; transform: translateX(0); pointer-events: all; }



      /* ── MOBILE RESPONSIVENESS FIXES ── */
      @media (max-width: 768px) {
        .runway-hud-top {
          padding: 8px 12px; width: 92%; border-radius: 20px;
          flex-wrap: nowrap; /* Keep it on one line but shrink items */
        }
        #runway-search-wrap { width: 35%; border-right: none; }
        #runway-search { padding: 5px 5px 5px 28px; font-size: 11px; }
        #runway-weather { display: none; } /* Hide weather text on mobile */
        #runway-counter { padding: 4px 10px; font-size: 9px; letter-spacing: 0.1em; }
        .runway-hud-right { gap: 6px; }
        #runway-upload-btn { height: 30px; padding: 0 10px; font-size: 8px; }
        
        #runway-img-wrap { height: 45vh; max-width: 92vw; margin-top: 80px; border-radius: 24px; }
        #runway-text-block { margin-top: 24px; width: 95%; }
        #runway-title { font-size: 1.8rem; }
        #runway-desc { font-size: 13px; }
        
        /* Hide arrows on mobile, rely on Swipe */
        .runway-ctrl { display: none; } 
        
        #runway-upload-toast { right: 50%; bottom: 40px; transform: translate(50%, 40px); font-size: 8px; width: 85%; text-align: center; }
        #runway-upload-toast.show { transform: translate(50%, 0); }

      }
    `;

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "runway-overlay";
    overlay.innerHTML = `
      <div id="runway-cursor-orb"></div>
      <div id="runway-slide">
        <img id="runway-backdrop" aria-hidden="true" />
        <div class="runway-glass-overlay"></div>
        <div id="runway-img-wrap">
          <div id="runway-scan-line"></div>
          <img id="runway-img" alt="Runway" />
          <video id="runway-video" muted playsinline loop style="display:none; width:100%; height:100%; object-fit:contain;"></video>
        </div>




        <div class="runway-hud-top">
          <div id="runway-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" id="runway-search" placeholder="SEARCH..." spellcheck="false" />
          </div>

          <div id="runway-counter">00 / 00</div>
          
          <div class="runway-hud-right">
            <button id="runway-upload-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:12px">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Photo
            </button>
            <div id="runway-weather">
              <span class="weather-dot"></span>
              <span id="runway-weather-txt">SYNC...</span>
            </div>
            <div style="display:flex; gap:10px; align-items:center; margin-left:8px; border-left:1px solid rgba(255,255,255,0.1); padding-left:10px;">
              <button id="runway-audio-btn" title="Toggle Music" style="background:none;border:none;color:#fff;cursor:pointer;padding:0;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              </button>
              <button id="runway-close" style="font-size:28px; color:rgba(255,255,255,0.6); background:none; border:none; cursor:pointer; padding:0; transition:0.3s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">×</button>
            </div>
          </div>
        </div>

        <div id="runway-text-block">
          <div id="runway-meta">Intelligence</div>
          <h2 id="runway-title">Runway</h2>
          <p id="runway-desc">Analyzing...</p>
        </div>

        <button class="runway-ctrl" id="runway-prev" title="Previous Slide">‹</button>
        <button class="runway-ctrl" id="runway-next" title="Next Slide">›</button>
        <div id="runway-progress"><div id="runway-progress-bar"></div></div>
        <div id="runway-upload-toast">✦ AI PROCESSING...</div>
      </div>
      <input type="file" id="runway-upload-hidden" accept="image/*" multiple style="display:none;" />
    `;
    document.body.appendChild(overlay);

    imgEl = overlay.querySelector("#runway-img");
    const videoEl = overlay.querySelector("#runway-video");
    titleEl = overlay.querySelector("#runway-title");
    descEl = overlay.querySelector("#runway-desc");

    metaEl = overlay.querySelector("#runway-meta");
    counterEl = overlay.querySelector("#runway-counter");
    searchInput = overlay.querySelector("#runway-search");
    audioBtn = overlay.querySelector("#runway-audio-btn");
    weatherBadge = overlay.querySelector("#runway-weather-txt");
    uploadInput = overlay.querySelector("#runway-upload-hidden");

    overlay.querySelector("#runway-close").onclick = close;
    overlay.querySelector("#runway-prev").onclick = () => _goto(currentIdx - 1);
    overlay.querySelector("#runway-next").onclick = () => _goto(currentIdx + 1);
    overlay.querySelector("#runway-upload-btn").onclick = () => { uploadInput.value = ""; uploadInput.click(); };
    searchInput.oninput = (e) => _handleSearch(e.target.value);
    audioBtn.onclick = _toggleAudio;
    uploadInput.addEventListener("change", _handleUpload);
    document.addEventListener("keydown", _onKey);

    // Desktop Scroll
    overlay.addEventListener("wheel", _handleWheel, { passive: false });

    // ── NEW: MOBILE TOUCH SWIPE ──
    overlay.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    overlay.addEventListener('touchend', e => {
      const touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) _goto(currentIdx + 1); // Swipe Left
      if (touchStartX - touchEndX < -50) _goto(currentIdx - 1); // Swipe Right
    }, { passive: true });

    // 💫 MOUSE ORB TRACKER
    const orb = overlay.querySelector("#runway-cursor-orb");
    overlay.addEventListener("mousemove", (e) => {
      orb.style.left = e.clientX + "px";
      orb.style.top = e.clientY + "px";
    });



    _initWeather();
  }

  function _handleWheel(e) {
    if (!overlay?.classList.contains("active") || scrollLock) return;
    scrollLock = true;
    if (e.deltaY > 0) _goto(currentIdx + 1);
    else if (e.deltaY < 0) _goto(currentIdx - 1);
    setTimeout(() => { scrollLock = false; }, 900);
  }

  async function _initWeather() {
    try {
      const res = await fetch("/api/weather");
      const w = await res.json();
      if (w && w.condition) {
        weatherBadge.textContent = `${w.condition.toUpperCase()} IN ${w.city.toUpperCase()} · ${w.style_advice.toUpperCase()}`;
      } else {
        weatherBadge.textContent = "STABLE CLIMATE · OPTIMAL CONTRAST";
      }
    } catch (e) {
      weatherBadge.textContent = "VISION CITY · NEUTRAL LIGHTING";
    }
  }

  function _handleSearch(q) {
    const query = q.toLowerCase().trim();
    items = !query ? [...originalItems, ...sessionUploads] : [...originalItems, ...sessionUploads].filter(it =>
      [it.title, it.style, it.color, it.desc].filter(Boolean).join(" ").toLowerCase().includes(query)
    );

    currentIdx = 0;
    if (items.length) {
      _renderSlide(items[0]);
      _resetTimer();
    } else {
      clearTimeout(autoTimer);
      titleEl.textContent = "No Matches";
      descEl.textContent = "Try adjusting your search terms.";
      metaEl.textContent = "System · Notice";
      imgEl.src = "";
      imgEl.classList.remove("loaded");
      counterEl.textContent = "00 / 00";
      const bd = overlay.querySelector("#runway-backdrop");
      if (bd) bd.src = "";
      overlay.querySelector("#runway-progress-bar").style.width = "0%";
    }
  }

  async function _handleUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    _showToast("✦ AI SCANNING...");
    const token = localStorage.getItem("fv_token") || "";

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        _showToast("❌ INVALID FILE TYPE");
        continue;
      }

      try {
        const fd = new FormData();
        fd.append("file", file);

        const validRes = await fetch("/api/upload/validate-image", {
          method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: fd
        });
        const validData = await validRes.json();

        if (validRes.ok && validData.is_fashion) {
          // --- TEMPORARY SESSION UPLOAD ONLY (NO DATABASE) ---
          const reader = new FileReader();
          reader.onload = (ev) => {
            const newItem = {
              imageUrl: ev.target.result,
              title: file.name.split(".")[0],
              desc: "Temporary Session Asset",
              style: validData.detected_subject || "Fashion",
              color: "Session Color"
            };

            sessionUploads.unshift(newItem);
            items = [...originalItems, ...sessionUploads];

            _showToast(`✦ MATCH: Added to Session`);

            currentIdx = 0;
            _renderSlide(items[0]);
            _resetTimer();
          };
          reader.readAsDataURL(file);
        } else {
          _showToast(`❌ REJECTED: Non-Fashion Asset`);
        }
      } catch (err) {
        _showToast("❌ AI SCAN FAILED");
      }
    }
  }

  function _toggleAudio() {
    isMuted = !isMuted;
    if (isMuted) {
      audio.pause();
      audioBtn.style.opacity = "0.5";
    } else {
      audio.play().catch(e => {
        console.warn("Audio Stream Blocked: Falling back to silent cinematic mode.");
        isMuted = true;
        audioBtn.style.opacity = "0.5";
      });
      audioBtn.style.opacity = "1";
    }
  }

  function _typeText(el, text, speed = 25) {
    el.textContent = "";
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
  }

  function _renderSlide(item) {
    if (!item) return;
    counterEl.textContent = `${String(currentIdx + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;

    // 🧬 CLEANUP REDUNDANT WORDS (e.g. "outfit outfit")
    let rawTitle = item.title || "Untitled";
    const words = rawTitle.split(/\s+/);
    const uniqueWords = [];
    words.forEach(w => {
      if (uniqueWords[uniqueWords.length - 1]?.toLowerCase() !== w.toLowerCase()) {
        uniqueWords.push(w);
      }
    });
    titleEl.textContent = uniqueWords.join(" ");

    // 🤖 TYPEWRITER EFFECT

    descEl.textContent = item.desc || "";


    metaEl.textContent = `${item.style || "Unknown"} · ${item.color || "Unknown"}`;

    const bd = overlay.querySelector("#runway-backdrop");
    const videoEl = overlay.querySelector("#runway-video");

    imgEl.classList.remove("loaded");

    const isVideo = item.imageUrl.toLowerCase().endsWith(".mp4") || item.imageUrl.includes("video");

    if (isVideo) {
      imgEl.style.display = "none";
      videoEl.style.display = "block";
      videoEl.src = item.imageUrl;
      videoEl.currentTime = 0;
      videoEl.play().catch(e => console.warn("Video Play Error:", e));
      if (bd) bd.src = ""; // Clear backdrop for video
    } else {
      videoEl.style.display = "none";
      videoEl.pause();
      imgEl.style.display = "block";
      imgEl.src = item.imageUrl;
      if (bd) bd.src = item.imageUrl;
    }

    imgEl.onload = () => {
      if (!isVideo) imgEl.classList.add("loaded");


      // 🔫 TRIGGER LASER SCAN
      const scan = overlay.querySelector("#runway-scan-line");
      scan.classList.remove("scanning");
      void scan.offsetWidth; // Trigger reflow
      scan.classList.add("scanning");
    };

    const block = overlay.querySelector("#runway-text-block");
    block.style.animation = "none"; block.offsetHeight; block.style.animation = "";

    // Reset zoom state on new slide
    imgEl.style.transition = "none";
    imgEl.style.transform = "scale(1.05)";
    imgEl.offsetHeight;
    imgEl.style.transition = "opacity 1.2s ease, transform 6s linear";
  }

  function _showToast(m) {
    const t = overlay.querySelector("#runway-upload-toast");
    t.textContent = m; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3500);
  }

  function _goto(idx) {
    if (!items.length) return;

    // ♾️ INFINITE LOOP CALCULATOR
    currentIdx = ((idx % items.length) + items.length) % items.length;

    _renderSlide(items[currentIdx]);
    _resetTimer();
  }

  function _startTimer() {
    if (!items.length) return;
    const bar = overlay.querySelector("#runway-progress-bar");

    // Resetting for a clean 100% run
    bar.style.transition = `width ${SLIDE_DURATION}ms linear`;
    bar.style.width = "100%";

    autoTimer = setTimeout(() => {
      if (overlay.classList.contains("active")) {
        _goto(currentIdx + 1);
      }
    }, SLIDE_DURATION);
  }

  function _resetTimer() {
    clearTimeout(autoTimer);
    const bar = overlay.querySelector("#runway-progress-bar");

    // VISUAL RESET: Forced sync
    bar.style.transition = "none";
    bar.style.width = "0%";

    // Trigger reflow to 'confirm' 0% width with the browser
    void bar.offsetHeight;

    if (overlay.classList.contains("active")) {
      _startTimer();
    }
  }

  function _onKey(e) {
    if (!overlay?.classList.contains("active")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") _goto(currentIdx - 1);
    if (e.key === "ArrowRight" || e.key === " ") _goto(currentIdx + 1);
  }

  function open(entries) {
    _buildDOM();
    originalItems = [...entries];
    items = [...originalItems, ...sessionUploads];
    currentIdx = 0;

    if (searchInput) searchInput.value = "";
    audioBtn.style.opacity = "0.5"; // Set initial muted visual state

    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    if (items.length) {
      _renderSlide(items[0]);
      _startTimer();
    }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    clearTimeout(autoTimer);
    audio.pause(); isMuted = true; audioBtn.style.opacity = "0.5";
  }

  return { open, close };
})();

window.RunwayMode = RunwayMode;