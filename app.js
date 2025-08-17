(() => {
  "use strict";

  const REVISION = "1.18.0-alpha";

  window.addEventListener("DOMContentLoaded", () => {
    const revEl = document.getElementById("rev");
    if (revEl) revEl.textContent = REVISION;
    document.title = "YorN " + REVISION;

    // Also log revision into diagnostics on startup
    const diag = document.getElementById("diagnostics");
    if (diag) {
      const line = JSON.stringify({ time: new Date().toISOString(), type: "config", revision: REVISION });
      if (diag.textContent === "No diagnostics yet.") diag.textContent = "";
      diag.textContent += (diag.textContent ? "\n" : "") + line;
    }
  });

  // ... rest of logic with share settings, overlays, charts, zip export
})();