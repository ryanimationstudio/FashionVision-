/**
 * FashionVision - Schedule Module
 * Handles the schedule form submit to /api/schedule.
 */

import { fetchWithAuth } from "./auth.js";
import { showToast } from "./app.js";
import { currentImageUrl, currentAnalysis, currentUploadId } from "./upload.js";

const API_BASE = "";

function showScheduleAlert(msg, type = "error") {
  const el = document.getElementById("schedule-alert");
  if (!el) return;
  el.textContent  = msg;
  el.className    = `alert ${type} visible`;
}

function hideScheduleAlert() {
  const el = document.getElementById("schedule-alert");
  if (el) el.className = "alert";
}

export function initSchedule() {
  // Toggle schedule section visibility
  const toggleBtn  = document.getElementById("schedule-toggle-btn");
  const section    = document.getElementById("schedule-section");
  const cancelBtn  = document.getElementById("schedule-cancel-btn");

  if (toggleBtn && section) {
    toggleBtn.addEventListener("click", () => {
      const visible = section.classList.contains("visible");
      if (visible) {
        section.classList.remove("visible");
        toggleBtn.textContent = "📅 Schedule";
      } else {
        section.classList.add("visible");
        toggleBtn.textContent = "✕ Cancel";
        // Set a reasonable default scheduled time (tomorrow same hour)
        const sch = document.getElementById("sch-time");
        if (sch && !sch.value) {
          const d = new Date(Date.now() + 86400000); // +1 day
          d.setSeconds(0, 0);
          sch.value = d.toISOString().slice(0, 16);
        }
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  if (cancelBtn && section) {
    cancelBtn.addEventListener("click", () => {
      section.classList.remove("visible");
      if (toggleBtn) toggleBtn.textContent = "📅 Schedule";
    });
  }

  // Form submission
  const form = document.getElementById("schedule-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideScheduleAlert();

    const title    = document.getElementById("sch-title")?.value.trim();
    const desc     = document.getElementById("sch-description")?.value.trim();
    const hashtags = document.getElementById("sch-hashtags")?.value.trim();
    const board    = document.getElementById("sch-board")?.value.trim();
    const time     = document.getElementById("sch-time")?.value;

    if (!title) {
      showScheduleAlert("Title is required.");
      return;
    }
    if (!time) {
      showScheduleAlert("Scheduled time is required.");
      return;
    }

    const btn = document.getElementById("schedule-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

    const payload = {
      title,
      description:    desc,
      hashtags:       hashtags,
      board_id:       board,
      scheduled_time: new Date(time).toISOString(),
      image_url:      currentImageUrl,
      image_path:     `upload/${currentUploadId || ""}`,
    };

    try {
      const res  = await fetchWithAuth(`${API_BASE}/api/schedule`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        if (btn) { btn.textContent = "Saved ✓"; btn.classList.add("btn--success"); }
        showScheduleAlert("Content scheduled successfully! 🎉", "success");
        showToast("Content scheduled!", "success");
        // Reset and close
        setTimeout(() => {
          hideScheduleAlert();
          const section = document.getElementById("schedule-section");
          if (section) section.classList.remove("visible");
          if (toggleBtn) toggleBtn.textContent = "📅 Schedule";
          if (btn) { btn.textContent = "Save Schedule"; btn.classList.remove("btn--success"); }
          if (btn) btn.disabled = false;
        }, 2000);
      } else {
        showScheduleAlert(data.error || "Failed to save. Please try again.");
        showToast(data.error || "Schedule failed.", "error");
        if (btn) { btn.disabled = false; btn.textContent = "Save Schedule"; }
      }
    } catch (err) {
      showScheduleAlert("Network error. Please try again.");
      showToast("Network error.", "error");
      if (btn) { btn.disabled = false; btn.textContent = "Save Schedule"; }
    }
  });
}
