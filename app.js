(() => {
  "use strict";

  const REVISION = "1.18.1-alpha";
  let pinFollow = true;
  let blazefaceModel;
  window.__yornPinFollow = pinFollow;

  // --- State for pan/drag ---
  let pan = { x: 0, y: 0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let panStart = { x: 0, y: 0 };
  let lastBox = null;

  // --- Diagnostics Logger ---
  function logDiagnostics(entry) {
    const diag = document.getElementById("diagnostics");
    if (!diag) return;
    const nearBottom = (diag.scrollHeight - diag.scrollTop - diag.clientHeight) <= 16;
    if (diag.textContent === "No diagnostics yet.") diag.textContent = "";
    diag.textContent += (diag.textContent ? "\n" : "") + entry;
    if (window.__yornPinFollow ?? true || nearBottom) {
      diag.scrollTop = diag.scrollHeight;
    }
  }
  window.__yornLog = window.__yornLog || logDiagnostics;

  function logEvt(type, obj = {}) {
    const payload = { time: new Date().toISOString(), type, ...obj };
    const line = JSON.stringify(payload);
    try { (window.__yornLog || logDiagnostics)(line); } catch {}
  }

  // --- Init ---
  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("rev").textContent = REVISION;
    document.title = "YorN " + REVISION;
    logEvt("config", { revision: REVISION, boot: "dom-ready" });

    // Diagnostics controls
    document.getElementById("pinBtn").onclick = () => {
      pinFollow = !pinFollow;
      window.__yornPinFollow = pinFollow;
      document.getElementById("pinBtn").textContent = pinFollow ? "Pinned ↓" : "Pin ↓";
    };
    document.getElementById("clearBtn").onclick = () => {
      document.getElementById("diagnostics").textContent = "No diagnostics yet.";
    };
    document.getElementById("copyBtn").onclick = () => {
      navigator.clipboard.writeText(document.getElementById("diagnostics").textContent);
    };

    // Sample load button
    document.getElementById("sampleBtn").onclick = async () => {
      logEvt("test", { step: "sample" });
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=1024&auto=format&fit=crop";
      await img.decode();
      const ctx = document.getElementById("photoCanvas").getContext("2d");
      ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
      runDetect(ctx.canvas);
    };

    // Drag-to-pan bindings
    const stage = document.getElementById("photoCanvas");
    stage.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      panStart = { x: pan.x, y: pan.y };
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      pan.x = panStart.x + (e.clientX - dragStart.x);
      pan.y = panStart.y + (e.clientY - dragStart.y);
      repaint();
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    stage.addEventListener('mouseleave', () => { isDragging = false; });

    // Double-click to center face
    stage.addEventListener('dblclick', () => {
      if (!lastBox) return;
      const cx = lastBox.x + lastBox.width/2;
      const cy = lastBox.y + lastBox.height/2;
      pan.x -= (cx - stage.width/2);
      pan.y -= (cy - stage.height/2);
      repaint();
      logEvt('config', { center_on_face: true, pan });
    });
  });

  // --- TFJS / Detection ---
  async function runDetect(canvas) {
    try {
      if (!blazefaceModel) {
        logEvt("config", { warmup: "loading" });
        blazefaceModel = await blazeface.load();
        logEvt("detect", { blazefaceReady: true });
      }
      const preds = await blazefaceModel.estimateFaces(canvas, false);
      logEvt("detect", { faces: preds.length });
      lastBox = preds.length ? boxFromPred(preds[0]) : null;
      repaint(preds);

      if (preds.length) {
        const globalScore = Math.round(Math.random() * 100);
        logEvt("analysis", { ok: true, global: globalScore });
        document.getElementById("analysisResults").textContent = "Global Score: " + globalScore;
        drawChart(globalScore);
      }
    } catch (e) {
      logEvt("error", { detect_exception: e.message });
    }
  }

  function boxFromPred(p){
    return { x: p.topLeft[0], y: p.topLeft[1], width: p.bottomRight[0]-p.topLeft[0], height: p.bottomRight[1]-p.topLeft[1] };
  }

  // --- Overlay drawing + repaint ---
  function repaint(preds) {
    const canvas = document.getElementById("photoCanvas");
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pan.x, pan.y);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();

    if (preds && preds.length) {
      drawOverlays(canvas, preds);
    } else if (lastBox) {
      drawOverlays(canvas, [lastBox]);
    }
  }

  function drawOverlays(canvas, preds) {
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 2;
    preds.forEach(p => {
      ctx.strokeRect(p.x, p.y, p.width, p.height);
    });

    if (document.getElementById("showThirds").checked) thirds(ctx, canvas);
    if (document.getElementById("showSymmetry").checked) symmetry(ctx, canvas);
    if (document.getElementById("showGolden").checked) golden(ctx, canvas);
  }

  function thirds(ctx, canvas) {
    const w = canvas.width, h = canvas.height;
    ctx.strokeStyle = "rgba(255,255,0,0.5)";
    ctx.beginPath();
    ctx.moveTo(w/3, 0); ctx.lineTo(w/3, h);
    ctx.moveTo(2*w/3, 0); ctx.lineTo(2*w/3, h);
    ctx.moveTo(0, h/3); ctx.lineTo(w, h/3);
    ctx.moveTo(0, 2*h/3); ctx.lineTo(w, 2*h/3);
    ctx.stroke();
  }
  function symmetry(ctx, canvas) {
    ctx.strokeStyle = "rgba(0,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(canvas.width/2, 0);
    ctx.lineTo(canvas.width/2, canvas.height);
    ctx.stroke();
  }
  function golden(ctx, canvas) {
    ctx.strokeStyle = "rgba(255,0,255,0.5)";
    const phi = 1.618;
    ctx.beginPath();
    ctx.moveTo(canvas.width/phi, 0);
    ctx.lineTo(canvas.width/phi, canvas.height);
    ctx.moveTo(0, canvas.height/phi);
    ctx.lineTo(canvas.width, canvas.height/phi);
    ctx.stroke();
  }

  // --- Chart drawing ---
  function drawChart(globalScore) {
    const ctx = document.getElementById("chartCanvas").getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(20, ctx.canvas.height - globalScore*2, 40, globalScore*2);
    ctx.fillStyle = "#000";
    ctx.fillText("Global", 20, ctx.canvas.height - 5);
    ctx.fillText(globalScore, 20, ctx.canvas.height - globalScore*2 - 5);
  }
})();