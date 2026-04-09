# FashionVision — Full Stack History & Accuracy Sync

Overhaul covering AI detection accuracy, history DB flow, UI cleanup, and archive interactions.

## Proposed Changes

---

### 1. Detection Accuracy — VQA Prompts

#### [MODIFY] [fashion_detector.py](file:///d:/Final%20Year%20Project/api/ai/fashion_detector.py)
Switch from a generic single-caption prompt to **multi-pass VQA** (Visual Question Answering). Instead of one free-form caption, we ask BLIP targeted questions:
- `"What color is this clothing?"` → Color
- `"What type of clothing is this?"` → Clothing type
- `"What pattern does this clothing have?"` → Pattern
- `"What is the style of this clothing?"` → Style

Each question gets a short, constrained answer. We then match the answer against our vocab lists. This eliminates hallucinated generic captions.

---

### 2. History Flow — DB Insert on `/analyze`

#### [MODIFY] [upload_routes.py](file:///d:/Final%20Year%20Project/api/upload_routes.py)
After a successful analysis + upload, also INSERT a row into the `fashion_history` Supabase table. Fields: `user_id`, `image_url`, `clothing_type`, `color`, `pattern`, `style`, `season`, `title`, `hashtags`.

#### [MODIFY] [config.py](file:///d:/Final%20Year%20Project/api/config.py)
Add `FASHION_HISTORY_TABLE = os.environ.get("SUPABASE_FASHION_HISTORY_TABLE", "fashion_history")` constant.

#### [MODIFY] [history_routes.py](file:///d:/Final%20Year%20Project/api/history_routes.py)
Update `/api/history` to also query the `fashion_history` table and return it in the response as `"history": [...]` alongside existing `uploads`.

#### [MODIFY] [ethereal_history.js](file:///d:/Final%20Year%20Project/static/js/ethereal_history.js)
- Fall back to `data.uploads` if `data.history` is empty, ensuring backwards compat.
- Update `meta` overlay to show `Type | Color | Style` (glassmorphic white, not dark).
- Add **double-click** listener on each card to open a side panel with full analysis + hashtags.
- Add the side panel HTML dynamically (since history.html is the host).

---

### 3. UI Cleanup

#### [MODIFY] [login.html](file:///d:/Final%20Year%20Project/templates/login.html)
Remove the entire `<script>` block in `<head>` that auto-redirects on page reload (lines 7–25).

#### [MODIFY] [dashboard.html](file:///d:/Final%20Year%20Project/templates/dashboard.html)
- Add `Archive` nav link next to `Lab` in the nav bar.
- Dashboard has no history section to remove (already clean ✓).

#### [MODIFY] [history.html](file:///d:/Final%20Year%20Project/templates/history.html)
- Add the side panel `<div id="archive-side-panel">` HTML with full analysis fields and hashtags display.

---

### 4. Archive Interaction

#### [MODIFY] [ethereal_history.js](file:///d:/Final%20Year%20Project/static/js/ethereal_history.js)
- **Hover**: meta overlay changes to glassmorphic white (`rgba(255,255,255,0.7)` + `backdrop-filter: blur(12px)`) text in `#2C2C2C`.
- **Double-Click**: opens `#archive-side-panel` with `Type | Color | Style | Season` attributes + hashtags list.

#### [MODIFY] [history.html](file:///d:/Final%20Year%20Project/templates/history.html)
Add CSS for `#archive-side-panel` (fixed right, white glass, slide-in on `.open`).

---

## Verification Plan

### Automated (None exist)
No existing test files found in the project. No new unit tests will be fabricated.

### Manual Verification — Step by Step

1. **Run the server**: `python -m api.index` from `d:\Final Year Project`
2. **Login** — go to `http://127.0.0.1:5000/login`. Reload the page → it should stay on login (no redirect).
3. **Dashboard nav** — after login, go to `/dashboard`. Confirm nav shows **FV · Lab · Archive**.
4. **Upload & Analyze** — drop an image, click "Extract Intelligence". In server logs, confirm BLIP VQA questions fire and specific tag values (color, type, etc.) are extracted.
5. **History insert** — in Supabase dashboard, confirm a new row appears in `fashion_history` table.
6. **Archive page** — go to `/history`. Cards should fall and pile up. Hover a card → glassmorphic white overlay shows `Type | Color | Style`. Double-click a card → side panel slides in with full details + hashtags.
