(() => {
  "use strict";

  const REVISION = "1.18.0-alpha";

  window.addEventListener("DOMContentLoaded", () => {
    const revEl = document.getElementById("rev");
    if (revEl) revEl.textContent = REVISION;
    document.title = "YorN " + REVISION;
  });

  // ... rest of logic with share settings, overlays, charts, zip export
})();