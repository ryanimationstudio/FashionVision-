/**
 * ============================================================
 * FashionVision — Interactive Moodboard Engine (v1.0)
 * Logic for Draggable Outfits & Digital Collage
 * ============================================================
 */

export function initMoodboard() {
  const navLab = document.getElementById('nav-lab');
  const navMoodboard = document.getElementById('nav-moodboard');
  const physicsContainer = document.getElementById('physics-container');
  const moodboardContainer = document.getElementById('moodboard-container');
  const mbItemsList = document.getElementById('mb-items-list');
  const mbElementsStage = document.getElementById('mb-elements-stage');
  const clearBtn = document.getElementById('mb-clear-btn');
  const saveBtn = document.getElementById('mb-save-btn');

  let isLoaded = false;

  // ── NAVIGATION LOGIC ──
  navMoodboard.addEventListener('click', async () => {
    console.log("Moodboard Clicked - Force Toggle");
    navLab.classList.remove('active');
    navMoodboard.classList.add('active');

    // Hide everything else
    if (physicsContainer) {
      physicsContainer.classList.add('hidden');
      physicsContainer.style.display = 'none';
    }
    const uploaderSidebar = document.getElementById('uploader-sidebar');
    if (uploaderSidebar) {
      uploaderSidebar.classList.add('hidden');
      uploaderSidebar.style.display = 'none';
    }

    // Show Moodboard
    moodboardContainer.classList.remove('hidden');
    moodboardContainer.style.display = 'flex';

    if (!isLoaded) {
      console.log("Loading Archive...");
      await loadArchiveItems();
      isLoaded = true;
    }
  });

  navLab.addEventListener('click', () => {
    console.log("Uploader Clicked - Force Toggle");
    navMoodboard.classList.remove('active');
    navLab.classList.add('active');

    // Hide Moodboard
    moodboardContainer.classList.add('hidden');
    moodboardContainer.style.display = 'none';

    // Show everything else
    if (physicsContainer) {
      physicsContainer.classList.remove('hidden');
      physicsContainer.style.display = 'block';
    }
    const uploaderSidebar = document.getElementById('uploader-sidebar');
    if (uploaderSidebar) {
      uploaderSidebar.classList.remove('hidden');
      uploaderSidebar.style.display = 'flex';
    }
  });

  // ── FETCH ARCHIVE ITEMS ──
  async function loadArchiveItems() {
    const token = localStorage.getItem('fv_token');
    if (!token) return;

    try {
      const res = await fetch('/api/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const items = data.history || [];

      mbItemsList.innerHTML = '';
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'mb-source-item rounded-2xl overflow-hidden glass border border-black/5 p-1 flex-shrink-0 w-24 h-24 lg:w-full lg:h-32';
        div.innerHTML = `<img src="${item.image_url}" class="w-full h-full object-cover rounded-xl" draggable="false">`;

        div.addEventListener('click', () => addElementToStage(item.image_url));
        mbItemsList.appendChild(div);
      });
    } catch (err) {
      console.error('Failed to load archive for moodboard:', err);
    }
  }

  // ── STAGE LOGIC (Drag & Drop) ──
  let zIndexCounter = 100;

  function addElementToStage(imgUrl) {
    const el = document.createElement('div');
    el.className = 'mb-element border-2 border-transparent group';

    // Initial Spawn Point (Center of stage)
    const stage = document.getElementById('mb-elements-stage');
    // Default size is roughly 150px (from CSS)
    const startX = (stage.clientWidth / 2) - 75;
    const startY = (stage.clientHeight / 2) - 100;

    el.setAttribute('data-x', startX);
    el.setAttribute('data-y', startY);
    el.style.transform = `translate(${startX}px, ${startY}px)`;
    el.style.zIndex = zIndexCounter++;

    el.innerHTML = `
      <img src="${imgUrl}" class="w-full h-full" draggable="false">
      <div class="delete-el absolute -top-3 -right-3 w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 cursor-pointer shadow-lg transition-opacity">✕</div>
    `;

    // Resize items on very small mobile screens
    if (window.innerWidth < 640) {
      el.style.width = '120px';
    } else {
      el.style.width = '160px'; // Default desktop size
    }

    // Interaction Indicators
    el.addEventListener('mousedown', () => {
      document.querySelectorAll('.mb-element').forEach(item => item.classList.remove('selected', 'border-brand'));
      el.classList.add('selected', 'border-brand');
      el.style.zIndex = zIndexCounter++;
    });

    // Support Touch
    el.addEventListener('touchstart', () => {
      document.querySelectorAll('.mb-element').forEach(item => item.classList.remove('selected', 'border-brand'));
      el.classList.add('selected', 'border-brand');
      el.style.zIndex = zIndexCounter++;
    }, { passive: true });

    // Delete Logic
    el.querySelector('.delete-el').onclick = (e) => {
      e.stopPropagation();
      el.remove();
    };

    mbElementsStage.appendChild(el);
    setupInteractivity(el);
  }

  function setupInteractivity(selector) {
    interact(selector)
      .draggable({
        inertia: true,
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: 'parent',
            endOnly: true
          })
        ],
        autoScroll: true,
        listeners: {
          move: dragMoveListener
        }
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: 'parent'
          }),
          interact.modifiers.restrictSize({
            min: { width: 50, height: 50 }
          })
        ],
        listeners: {
          move(event) {
            let { x, y } = event.target.dataset
            x = parseFloat(x) || 0
            y = parseFloat(y) || 0

            Object.assign(event.target.style, {
              width: `${event.rect.width}px`,
              height: `${event.rect.height}px`,
              transform: `translate(${x + event.deltaRect.left}px, ${y + event.deltaRect.top}px)`
            })

            Object.assign(event.target.dataset, {
              x: x + event.deltaRect.left,
              y: y + event.deltaRect.top
            })
          }
        }
      });
  }

  function dragMoveListener(event) {
    var target = event.target
    var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
    var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

    target.style.transform = 'translate(' + x + 'px, ' + y + 'px)'

    target.setAttribute('data-x', x)
    target.setAttribute('data-y', y)
  }

  // ── BUTTONS ──
  clearBtn.addEventListener('click', () => {
    mbElementsStage.innerHTML = '';
  });

  saveBtn.addEventListener('click', () => {
    html2canvas(mbElementsStage, {
      useCORS: true,
      backgroundColor: '#f9f9f9'
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = 'fashionvision-outfit.png';
      link.href = canvas.toDataURL();
      link.click();
    });
  });
}

// Initial Kick-off
document.addEventListener('DOMContentLoaded', initMoodboard);
