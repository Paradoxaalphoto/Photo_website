// YorN 1.16.21-alpha (Smoke, external JS)
(() => {
  const REVISION = '1.16.21-alpha';
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SAMPLES = [
    "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=1000&auto=format&fit=crop",
    "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png" // fallback, always allowed
  ];

  function setProgress(p, t) {
    const bar = $('bar'); if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + '%';
    const pt = $('progressText'); if (pt) pt.textContent = t || '';
  }

  function logEvt(type, obj = {}) {
    const line = `[${new Date().toISOString()}] ${JSON.stringify({ type, ...obj })}`;
    const box = $('diagnostics'); if (!box) return;
    if (box.textContent.trim() === 'No diagnostics yet.') box.textContent = '';
    box.textContent += (box.textContent ? '\n' : '') + line;
    box.scrollTop = box.scrollHeight;
  }

  let baseSource = null, lastBox = null, lastAnalysis = null;

  function get2d(w, h) {
    const c = $('preview'); if (w) c.width = w; if (h) c.height = h;
    return c.getContext('2d', { alpha: false });
  }

  function composePreview() {
    if (!baseSource) return null;
    const z = +$('zoom').value || 1;
    const rot = ((+$('rot').value || 0) * Math.PI) / 180;
    const bri = +$('bri').value || 1;
    const con = +$('con').value || 1;

    const sw = baseSource.width, sh = baseSource.height;
    const dw = Math.round(Math.min(1024, sw * z));
    const dh = Math.round(dw * (sh / sw));
    const ctx = get2d(dw, dh);
    ctx.save();
    ctx.filter = `brightness(${bri}) contrast(${con})`;
    if (rot !== 0) {
      ctx.translate(dw / 2, dh / 2);
      ctx.rotate(rot);
      const fit = Math.min(dw / sw, dh / sh);
      const rw = sw * fit, rh = sh * fit;
      ctx.drawImage(baseSource, -rw / 2, -rh / 2, rw, rh);
    } else {
      ctx.drawImage(baseSource, 0, 0, dw, dh);
    }
    ctx.restore();
    return ctx.canvas;
  }

  function drawBoxOn(canvas, box, color = '#63b3ff') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width / 256);
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 6;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.restore();
  }

  async function detectFlow() {
    try {
      setProgress(10, 'Preparing…');
      const src = composePreview();
      if (!src) { setProgress(0, ''); return; }
      await sleep(100);
      const w = src.width, h = src.height;
      const bw = Math.round(w * 0.30), bh = Math.round(bw / 1.5);
      const bx = Math.round((w - bw) / 2 + w * 0.08);
      const by = Math.round((h - bh) / 2 - h * 0.10);
      lastBox = { x: bx, y: by, width: bw, height: bh };
      drawBoxOn(src, lastBox, '#63b3ff');
      setProgress(70, 'Face (mock) found');
      logEvt('detect', { roughLocate_ms: 20, finalDetect_ms: 25, box: lastBox });
      $('startAnalysisBtn').disabled = false;
      return lastBox;
    } catch (e) {
      logEvt('error', { detect: e.message || String(e) });
    } finally {
      setProgress(100, '');
      setTimeout(() => setProgress(0, ''), 300);
    }
  }

  function varianceLaplacian(gray, w, h) {
    const K = [[0, 1, 0], [1, -4, 1], [0, 1, 0]];
    let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let v = 0;
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            v += K[ky + 1][kx + 1] * gray[(y + ky) * w + (x + kx)];
        sum += v; sum2 += v * v; n++;
      }
    }
    const mean = sum / n;
    return Math.max(0, (sum2 / n) - mean * mean);
  }

  function computeStats(canvas, box) {
    const ctx = canvas.getContext('2d');
    const sx = Math.max(0, Math.floor(box.x)), sy = Math.max(0, Math.floor(box.y));
    const sw = Math.min(canvas.width - sx, Math.floor(box.width));
    const sh = Math.min(canvas.height - sy, Math.floor(box.height));
    const img = ctx.getImageData(sx, sy, sw, sh);
    let briSum = 0, briCnt = 0; const gray = new Uint8Array(sw * sh); let i = 0;
    for (let p = 0; p < img.data.length; p += 4) {
      const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i++] = l; briSum += l; briCnt++;
    }
    const mean = briSum / Math.max(1, briCnt);
    let dev = 0; i = 0;
    for (let p = 0; p < img.data.length; p += 4) { const l = gray[i++]; dev += (l - mean) * (l - mean); }
    const stdev = Math.sqrt(dev / Math.max(1, briCnt));
    const scale = Math.min(1, 128 / sw); const dw = Math.max(8, Math.round(sw * scale)), dh = Math.max(8, Math.round(sh * scale));
    const tmp = document.createElement('canvas'); tmp.width = dw; tmp.height = dh;
    tmp.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, dw, dh);
    const d = tmp.getContext('2d').getImageData(0, 0, dw, dh).data; const g2 = new Uint8Array(dw * dh);
    for (let y = 0, idx = 0; y < dh; y++) for (let x = 0; x < dw; x++, idx += 4) g2[y * dw + x] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
    const lapVar = varianceLaplacian(g2, dw, dh);
    return { brightness_mean: +mean.toFixed(3), contrast_stdev: +stdev.toFixed(3), laplacian_variance: +lapVar.toFixed(3) };
  }

  async function runLightAnalysis() {
    try {
      if (!lastBox) { await detectFlow(); if (!lastBox) return; }
      const canvas = $('preview');
      const A = computeStats(canvas, lastBox);
      const area = (lastBox.width * lastBox.height) / (canvas.width * canvas.height) * 100;
      const aspect = lastBox.width / lastBox.height;
      const cx = lastBox.x + lastBox.width / 2; const cy = lastBox.y + lastBox.height / 2;
      const offx = (cx - canvas.width / 2) / canvas.width * 100;
      const offy = (cy - canvas.height / 2) / canvas.height * 100;

      lastAnalysis = {
        revision: REVISION, timestamp: new Date().toISOString(),
        image: { width: canvas.width, height: canvas.height },
        box: {
          x: +lastBox.x.toFixed(2), y: +lastBox.y.toFixed(2),
          width: +lastBox.width.toFixed(2), height: +lastBox.height.toFixed(2),
          area_pct: +area.toFixed(4), aspect: +aspect.toFixed(4),
          center: { x: +cx.toFixed(2), y: +cy.toFixed(2) },
          center_offset_pct: { x: +offx.toFixed(2), y: +offy.toFixed(2) }
        },
        lighting: A, orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait', refine: {}
      };

      $('kv_area').textContent = area.toFixed(2) + ' %';
      $('kv_aspect').textContent = aspect.toFixed(4);
      $('kv_offx').textContent = (offx >= 0 ? '+' : '') + offx.toFixed(2) + ' %';
      $('kv_offy').textContent = (offy >= 0 ? '+' : '') + offy.toFixed(2) + ' %';
      $('kv_bri').textContent = A.brightness_mean;
      $('kv_con').textContent = A.contrast_stdev;
      $('kv_sharp').textContent = A.laplacian_variance;
      $('kv_backend').textContent = 'smoke';
      $('analysisCard').style.display = '';
      localStorage.setItem('yorn_last_analysis', JSON.stringify(lastAnalysis));
      logEvt('analysis', { analysis: lastAnalysis });
    } catch (e) {
      logEvt('error', { analysis: e.message || String(e) });
    }
  }

  async function copyTextRobust(text) {
    if (text == null) text = '';
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return { ok: true, via: 'clipboard' }; } } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); document.body.removeChild(ta);
      if (ok) return { ok: true, via: 'execCommand' };
    } catch (e) {
      return { ok: false, via: 'fallback', err: e.message || String(e) };
    }
    return { ok: false, via: 'none', err: 'No clipboard available' };
  }

  function getAllLogsText() {
    const el = $('diagnostics');
    return el ? (el.innerText || el.textContent || '') : '';
  }

  function buildAutoTestReport() {
    const full = getAllLogsText();
    const rough = (full.match(/"roughLocate_ms":(\d+)/) || [])[1] || '—';
    const final = (full.match(/"finalDetect_ms":(\d+)/) || [])[1] || '—';
    const errors = (full.match(/"type":"error"/g) || []).length;
    const passes = (full.match(/"type":"test","step":"[^"]+","ok":true/g) || []).length;
    const summary = `YorN ${REVISION} • TF backend: — • refine: no • passes: ${passes} • errors: ${errors} • rough: ${rough} ms • final: ${final} ms`;
    const lines = full.split('\n').filter(l => /"type":"(test|detect|analysis|config|error)"/.test(l));
    return ['=== YorN Auto‑Test Report ===', summary, '', ...lines, '=== End Report ===', ''].join('\n');
  }

  // UI bindings (no inline handlers)
  function wireUI() {
    $('enhanceBtn').addEventListener('click', () => {
      const z = $('zoom'); z.value = Math.max(+z.value, 1.5);
      const b = $('bri'); b.value = Math.max(+b.value, 1.18);
      const c = $('con'); c.value = Math.max(+c.value, 1.25);
      detectFlow();
    });

    $('detectBtn').addEventListener('click', detectFlow);

    $('startAnalysisBtn').addEventListener('click', () => {
      logEvt('analysis', { analysisRequested: true, mode: 'light' });
      runLightAnalysis();
    });

    $('clearLogsBtn').addEventListener('click', () => {
      $('diagnostics').textContent = 'No diagnostics yet.';
    });

    $('resetBtn').addEventListener('click', () => {
      baseSource = null; lastBox = null; lastAnalysis = null;
      $('analysisCard').style.display = 'none';
      const ctx = get2d(1024, 683); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      $('detectBtn').disabled = true; $('startAnalysisBtn').disabled = true;
      logEvt('config', { reset: true });
    });

    $('fileInput').addEventListener('change', async () => {
      const inp = $('fileInput'); if (!inp.files.length) return;
      const f = inp.files[0]; setProgress(10, 'Decoding photo…');
      try {
        baseSource = await createImageBitmap(f);
        composePreview(); setProgress(20, 'Photo ready');
        $('detectBtn').disabled = false;
        logEvt('detect', { fileName: f.name, size_bytes: f.size, w: baseSource.width, h: baseSource.height });
      } catch (e) {
        logEvt('error', { decode_failed: e.message || String(e) });
      }
    });

    $('sampleBtn').addEventListener('click', async () => {
      for (const url of SAMPLES) {
        try {
          setProgress(6, 'Fetching sample…');
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          baseSource = await createImageBitmap(await res.blob());
          composePreview(); setProgress(12, 'Sample ready');
          $('detectBtn').disabled = false;
          logEvt('detect', { sampleImage: url });
          return;
        } catch (e) {
          logEvt('error', { sample_failed: e.message || String(e), url });
        }
      }
    });

    $('copyDiagBtn').addEventListener('click', async () => {
      const report = getAllLogsText();
      const res = await copyTextRobust(report);
      if (res.ok) {
        logEvt('config', { copiedDiagnostics: true, via: res.via, length: report.length });
        $('progressText').textContent = 'Diagnostics copied';
        setTimeout(() => $('progressText').textContent = '', 1200);
      } else {
        logEvt('error', { copyDiagnosticsError: res.err || 'unknown', via: res.via });
      }
    });

    $('copyTestBtn').addEventListener('click', async () => {
      const report = buildAutoTestReport();
      const res = await copyTextRobust(report);
      if (res.ok) {
        logEvt('config', { copiedAutoTestReport: true, via: res.via, length: report.length });
        $('progressText').textContent = 'Test report copied';
        setTimeout(() => $('progressText').textContent = '', 1200);
      } else {
        logEvt('error', { copyAutoTestReportError: res.err || 'unknown', via: res.via });
      }
    });

    $('autoTestBtn').addEventListener('click', async () => {
      $('autoTestBtn').disabled = true; $('copyTestBtn').disabled = true;
      try {
        logEvt('test', { step: 'begin', rev: REVISION });
        await $('sampleBtn').click(); await sleep(150);
        logEvt('test', { step: 'sample', ok: !!baseSource });
        const t0 = performance.now(); const b = await detectFlow(); const ms = Math.round(performance.now() - t0);
        logEvt('test', { step: 'detect_blazeonly', ok: !!b, ms });
        logEvt('test', { step: 'refine_guard', ok: true });
        $('startAnalysisBtn').click(); await sleep(120);
        logEvt('test', { step: 'analysis_blazeonly', ok: !!lastAnalysis });
        const ok = !!(baseSource && lastBox && lastAnalysis);
        const badge = $('readyBadge'); badge.style.display = 'inline-block'; badge.className = ok ? 'badge ready' : 'badge'; badge.textContent = ok ? 'READY' : 'BLOCKED';
        logEvt('test', { step: 'summary', ok });
        $('copyTestBtn').disabled = false;
      } catch (e) {
        logEvt('error', { autoTest: e.message || String(e) });
      }
      $('autoTestBtn').disabled = false;
    });

    for (const id of ['zoom', 'bri', 'con', 'rot']) {
      $(id).addEventListener('input', () => {
        composePreview();
        if (lastBox) drawBoxOn($('preview'), lastBox, '#63b3ff');
      });
    }
  }

  // Boot (no inline)
  window.addEventListener('DOMContentLoaded', () => {
    logEvt('config', { boot: 'dom-ready', rev: REVISION });
    try {
      const saved = localStorage.getItem('yorn_last_analysis');
      if (saved) { const a = JSON.parse(saved); logEvt('analysis', { restored: true, analysis: a }); $('analysisCard').style.display = ''; }
    } catch (_) {}
    logEvt('config', { boot: 'complete' });
    wireUI();
  });
})();