(() => {
  "use strict";

  const REVISION = "1.18.0-alpha";

  // Pin-to-bottom state
  let pinFollow = true; // default ON until launch

  function setPinUI(on) {
    const btn = document.getElementById("pinBtn");
    if (!btn) return;
    btn.textContent = on ? "Pinned ↓" : "Pin ↓";
    btn.classList.toggle("pin-on", !!on);
  }

  function isNearBottom(el, slopPx = 16) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= slopPx;
  }

  function logDiagnostics(entry) {
    const diag = document.getElementById("diagnostics");
    if (!diag) return;
    const shouldStick = pinFollow || isNearBottom(diag);
    if (diag.textContent === "No diagnostics yet.") diag.textContent = "";
    diag.textContent += (diag.textContent ? "
" : "") + entry;
    if (shouldStick) diag.scrollTop = diag.scrollHeight;
  }

  window.addEventListener("DOMContentLoaded", () => {
    const revEl = document.getElementById("rev");
    if (revEl) revEl.textContent = REVISION;
    document.title = "YorN " + REVISION;
    setPinUI(pinFollow);

    // Also log revision into diagnostics on startup
    const line = JSON.stringify({ time: new Date().toISOString(), type: "config", revision: REVISION });
    logDiagnostics(line);

    // Bind Pin + Clear
    const pinBtn = document.getElementById("pinBtn");
    const clearBtn = document.getElementById("clearBtn");
    const diag = document.getElementById("diagnostics");

    if (pinBtn) pinBtn.addEventListener("click", () => {
      pinFollow = !pinFollow;
      setPinUI(pinFollow);
      if (pinFollow && diag) diag.scrollTop = diag.scrollHeight;
    });

    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (diag) diag.textContent = "No diagnostics yet.";
    });

    // If user scrolls up, unpin automatically; re-pin if they scroll back to bottom
    if (diag) diag.addEventListener("scroll", () => {
      const atBottom = isNearBottom(diag);
      if (!atBottom && pinFollow) { pinFollow = false; setPinUI(false); }
      else if (atBottom && !pinFollow) { /* do not force on; user can click Pin */ }
    });
  });

  // Exported for other modules (if you log elsewhere)
  window.__yornLog = logDiagnostics;

  // ... rest of logic with share settings, overlays, charts, zip export
})();