(() => {
  "use strict";

  const REVISION = "1.18.2-alpha";
  const $ = id => document.getElementById(id);
  const stage = $("stage");
  const ctx = stage.getContext("2d", { willReadFrequently: true });

  /* ===== State ===== */
  let sourceBitmap=null;     // always repaint from this
  let faceModel=null;
  let lastBox=null, lastAnalysis=null;
  let allBoxes=[];           // multiple faces
  let isBusy=false, tfVersion="—", __autoTestStartIdx=0;
  let detectMsLast='—', detectMsAvg='—';
  const session = { detects:0, detectTimes:[], analyses:0 };

  // View transform
  let pan = { x: 0, y: 0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let panStart = { x: 0, y: 0 };

  // Overlays
  let overlay = {
    thirds: JSON.parse(localStorage.getItem('yorn_thirds')||'false'),
    sym: JSON.parse(localStorage.getItem('yorn_sym')||'false'),
    golden: JSON.parse(localStorage.getItem('yorn_golden')||'false')
  };

  // Share settings
  let shareCfg = {
    watermark: localStorage.getItem('yorn_wm_text') || 'YorN • Prototype',
    tags: (localStorage.getItem('yorn_wm_tags') || '#YorN #AI #FaceAnalysis').split(/\s+/).filter(Boolean)
  };

  /* ===== Diagnostics ===== */
  function isNearBottom(el, slopPx = 16) { return el.scrollHeight - el.scrollTop - el.clientHeight <= slopPx; }
  function logDiagnostics(entry){
    const diag = $("diagnostics"); if (!diag) return;
    const shouldStick = (window.__yornPinFollow ?? true) || isNearBottom(diag);
    if (diag.textContent === "No diagnostics yet.") diag.textContent = "";
    diag.textContent += (diag.textContent ? "\n" : "") + entry;
    if (shouldStick) diag.scrollTop = diag.scrollHeight;
  }
  window.__yornLog = window.__yornLog || logDiagnostics;
  function logEvt(type, obj={}){ const line = JSON.stringify({ time:new Date().toISOString(), type, ...obj }); try { (window.__yornLog || logDiagnostics)(line); } catch {} }

  /* ===== Utils ===== */
  function setBusy(v){ isBusy=!!v; $("veil").classList.toggle("show", isBusy); ["detectBtn","startAnalysisBtn","autoTestBtn","enhanceBtn","cropBtn"].forEach(id=>{ const b=$(id); if(b) b.disabled = !!v; }); }
  function getAllLogsText(){ const el=$("diagnostics"); return el ? (el.innerText||el.textContent||"") : ""; }
  function setProgress(_, msg){ $("progressText").textContent = msg || ""; }
  function safeBackend(){ try { return (window.tf && typeof tf.getBackend==='function') ? (tf.getBackend()||'—') : '—'; } catch { return '—'; } }
  function updateTfBadges(){ $("tfChip").textContent = safeBackend(); $("tfVer").textContent = String(tfVersion||'—'); $("perfChip").textContent = `${detectMsLast} ms • avg ${detectMsAvg} ms`; }
  function updateSessionStats(){ const avg = session.detectTimes.length ? Math.round(session.detectTimes.reduce((a,b)=>a+b,0)/session.detectTimes.length) : '—'; $("sessStats").textContent = `${session.detects} detects • ${session.analyses} analyses`; logEvt('config',{ session:`${session.detects} detects • ${session.analyses} analyses`, avg_detect_ms: avg }); }

  /* ===== Error capture ===== */
  window.onerror = (msg, src, line, col, err) => { logEvt("error",{ onerror:String(msg), src, line, col, stack: err && err.stack ? String(err.stack) : undefined }); };
  window.onunhandledrejection = ev => { logEvt("error",{ unhandledrejection:String(ev.reason && ev.reason.message || ev.reason || 'unknown') }); };

  /* ===== Drawing ===== */
  function paintBase(){
    ctx.save();
    ctx.clearRect(0,0,stage.width,stage.height);

    if (sourceBitmap) {
      const rot=parseFloat($("rot").value||"0")*Math.PI/180;
      const zoom=parseFloat($("zoom").value||"1");
      const bri=parseFloat($("bri").value||"1");
      const con=parseFloat($("con").value||"1");

      ctx.filter = `brightness(${bri}) contrast(${con})`;
      ctx.translate(stage.width/2, stage.height/2);
      ctx.rotate(rot);
      ctx.translate(pan.x, pan.y); // pan after rotate

      const dw=stage.width*zoom, dh=stage.height*zoom;
      ctx.drawImage(sourceBitmap, -dw/2, -dh/2, dw, dh);
    }

    ctx.restore();
    logEvt('overlay',{ painted:{w:stage.width,h:stage.height}, pan });
  }

  function drawGuides(b){
    const w=stage.width, h=stage.height;
    if (overlay.thirds){
      ctx.save(); ctx.strokeStyle="#3a99ff"; ctx.lineWidth=1; ctx.setLineDash([6,6]);
      ctx.beginPath();
      ctx.moveTo(w/3,0); ctx.lineTo(w/3,h);
      ctx.moveTo(2*w/3,0); ctx.lineTo(2*w/3,h);
      ctx.moveTo(0,h/3); ctx.lineTo(w,h/3);
      ctx.moveTo(0,2*h/3); ctx.lineTo(w,2*h/3);
      ctx.stroke(); ctx.restore();
    }
    if (overlay.sym){
      ctx.save(); ctx.strokeStyle="#7dd3fc"; ctx.lineWidth=1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke(); ctx.restore();
    }
    if (overlay.golden && b){
      const phi=1.6180339887; const x=b.x, y=b.y, bw=b.width, bh=b.height;
      const v1=x + bw*(1/phi), v2=x + bw*(1 - 1/phi);
      const h1=y + bh*(1/phi), h2=y + bh*(1 - 1/phi);
      ctx.save(); ctx.strokeStyle="#f6c16b"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath();
      ctx.moveTo(v1,y); ctx.lineTo(v1,y+bh); ctx.moveTo(v2,y); ctx.lineTo(v2,y+bh);
      ctx.moveTo(x,h1); ctx.lineTo(x+bw,h1); ctx.moveTo(x,h2); ctx.lineTo(x+bw,h2);
      ctx.stroke(); ctx.restore();
    }
  }

  function drawOverlay(box){
    paintBase();
    // draw all boxes faintly
    ctx.save(); ctx.strokeStyle="rgba(98,208,255,.35)"; ctx.lineWidth=2;
    allBoxes.forEach(b=>ctx.strokeRect(b.x,b.y,b.width,b.height));
    ctx.restore();
    // highlight selected
    if (box){
      ctx.save(); ctx.strokeStyle="#62d0ff"; ctx.lineWidth=3; ctx.strokeRect(box.x, box.y, box.width, box.height); ctx.restore();
    }
    drawGuides(box);
  }

  /* ===== Image decode ===== */
  async function decodeBitmapFromBlob(blob){ return await createImageBitmap(blob); }

  /* ===== TF / Model ===== */
  async function initTF(){
    if(!window.tf){ logEvt('error',{tf_init:'tf not present'}); throw new Error('tf missing'); }
    await tf.ready();
    tfVersion = tf?.version_core || tf?.version?.tfjs || tfVersion || '—';
    updateTfBadges();
    try {
      const want = $("backendSel").value || safeBackend() || 'webgl';
      const t0=performance.now();
      await tf.setBackend(want);
      await tf.ready();
      logEvt('config',{warmup:'ok', backend:safeBackend(), ms:Math.round(performance.now()-t0)});
    } catch(e){
      logEvt('error',{warmup:e.message||String(e)});
    }
    updateTfBadges();
  }
  async function loadModel(){
    if(faceModel) return;
    try{ faceModel = await blazeface.load(); logEvt('detect',{blazefaceReady:true}); }
    catch(e){ logEvt('error',{blazeface_failed:e.message||String(e)}); throw e; }
  }

  /* ===== Detection ===== */
  const mapPred = p => {
    const [x1,y1] = p.topLeft;
    const [x2,y2] = p.bottomRight;
    return { x:x1, y:y1, width:x2-x1, height:y2-y1, prob:(p.probability?.[0] ?? 0) };
  };

  async function detectOnce(){
    if(!sourceBitmap) return null;
    await initTF();
    await loadModel();

    const runPredict = async () => {
      const input = tf.browser.fromPixels(stage);
      try { return await faceModel.estimateFaces(input, false, false); }
      finally { input.dispose?.(); }
    };
    const timed=(ms,fn)=>new Promise((resolve,reject)=>{
      let done=false;
      const t=setTimeout(()=>{ if(!done){ done=true; reject(new Error('detect_timeout')); } }, ms);
      fn().then(v=>{ if(!done){ done=true; clearTimeout(t); resolve(v); }})
        .catch(e=>{ if(!done){ done=true; clearTimeout(t); reject(e); }});
    });

    const t0=performance.now();
    try {
      // Ensure model sees the current pixel frame
      paintBase();
      const preds = await timed(3500, runPredict);
      if(!preds || !preds.length){ logEvt('error',{detect:'no_face'}); return null; }
      const dt = Math.round(performance.now()-t0);
      detectMsLast = dt;
      session.detectTimes.push(dt);
      detectMsAvg = Math.round(session.detectTimes.reduce((a,b)=>a+b,0)/session.detectTimes.length);
      updateTfBadges();

      allBoxes = preds.map(mapPred).sort((a,b)=>b.prob-a.prob);
      lastBox = allBoxes[0];

      session.detects += 1;
      drawOverlay(lastBox);
      renderFaceStrip();
      logEvt('detect',{ roughLocate_ms:dt, finalDetect_ms:dt, faces:allBoxes.length, box:lastBox });
      updateSessionStats();
      $("cropBtn").disabled = false;
      return lastBox;
    } catch(e){
      const cur=safeBackend();
      if(e && e.message==='detect_timeout' && cur==='webgl'){
        logEvt('error',{detect_timeout:true, backend:cur, fallback:'wasm_retry'});
        try {
          await tf.setBackend('wasm'); await tf.ready();
          tfVersion = tf?.version_core || tf?.version?.tfjs || tfVersion || '—';
          faceModel=null; await loadModel();
          const t1=performance.now();
          paintBase();
          const preds=await timed(3500, runPredict);
          if(preds && preds.length){
            const dt=Math.round(performance.now()-t1);
            detectMsLast = dt; session.detectTimes.push(dt);
            detectMsAvg = Math.round(session.detectTimes.reduce((a,b)=>a+b,0)/session.detectTimes.length);
            allBoxes = preds.map(mapPred).sort((a,b)=>b.prob-a.prob);
            lastBox = allBoxes[0];
            drawOverlay(lastBox);
            renderFaceStrip();
            logEvt('detect',{roughLocate_ms:dt, finalDetect_ms:dt, faces:allBoxes.length, box:lastBox});
            updateSessionStats();
            $("cropBtn").disabled = false;
            return lastBox;
          } else { logEvt('error',{detect:'no_face_after_fallback'}); return null; }
        } catch(e2){ logEvt('error',{detect_fallback_failed:e2.message||String(e2)}); return null; }
      } else { logEvt('error',{detect_exception:e.message||String(e)}); return null; }
    }
  }

  /* ===== Face strip ===== */
  function renderFaceStrip(){
    const strip = $("faceStrip");
    strip.innerHTML = "";
    allBoxes.forEach((b, i) => {
      const div = document.createElement('div'); div.className = 'thumb' + (b===lastBox?' active':'');
      const c = document.createElement('canvas'); c.width=72; c.height=72;
      const g = c.getContext('2d');
      // crop from stage into thumb (clamped)
      const sx = Math.max(0, Math.floor(b.x));
      const sy = Math.max(0, Math.floor(b.y));
      const sw = Math.min(stage.width - sx, Math.floor(b.width));
      const sh = Math.min(stage.height - sy, Math.floor(b.height));
      g.drawImage(stage, sx, sy, sw, sh, 0, 0, 72, 72);
      div.appendChild(c);
      div.title = `Face #${i+1} • ${(b.prob*100).toFixed(0)}%`;
      div.onclick = () => { lastBox = b; strip.querySelectorAll('.thumb').forEach(e=>e.classList.remove('active')); div.classList.add('active'); drawOverlay(lastBox); };
      strip.appendChild(div);
    });
  }

  /* ===== Analysis ===== */
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const normalizeContrast = s => clamp((s/60)*100,0,100);
  const normalizeSharpness = lv => { const val = Math.log10(1+lv)/Math.log10(1+5000); return clamp(val*100,0,100); };
  const normalizeBrightness = m => clamp((m/255)*100,0,100);

  function computeAnalysis(){
    if(!lastBox || !sourceBitmap) return null;
    const w=stage.width,h=stage.height; const b=lastBox;
    const area_pct=(b.width*b.height)/(w*h)*100;
    const center={x:b.x+b.width/2,y:b.y+b.height/2};
    const center_offset_pct={ x:((center.x-w/2)/(w/2))*100, y:((center.y-h/2)/(h/2))*100 };

    const img=ctx.getImageData(0,0,w,h);
    let sum=0, n=img.data.length/4, vals=[];
    for(let i=0;i<img.data.length;i+=4){
      const Y=0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2];
      vals.push(Y); sum+=Y;
    }
    const mean=sum/n;
    let v=0; for(let i=0;i<vals.length;i++){ const d=vals[i]-mean; v+=d*d; }
    const contrast=Math.sqrt(v/n);

    let sharp=0,m=0; const step=4;
    for(let y=1;y<h-1;y+=step){
      for(let x=1;x<w-1;x+=step){
        const idx=(y*w+x)*4;
        const c=img.data[idx];
        const l=img.data[idx-4], r=img.data[idx+4];
        const t=img.data[idx-4*w], bt=img.data[idx+4*w];
        const lap=(4*c - l - r - t - bt);
        sharp+=lap*lap; m++;
      }
    }
    const lapVar=m? sharp/m : 0;

    const brightnessScore = normalizeBrightness(mean);
    const contrastScore = normalizeContrast(contrast);
    const sharpnessScore = normalizeSharpness(lapVar);
    const centerPenalty = clamp((Math.abs(center_offset_pct.x)+Math.abs(center_offset_pct.y))/4, 0, 30);
    const globalScore = clamp(0.6*sharpnessScore + 0.25*contrastScore + 0.15*brightnessScore - centerPenalty, 0, 100);

    const buckets = [
      { region:'Global',        score: globalScore },
      { region:'North America', score: clamp(globalScore + (brightnessScore-50)/10, 0, 100) },
      { region:'Europe',        score: clamp(globalScore + (contrastScore-50)/12, 0, 100) },
      { region:'East Asia',     score: clamp(globalScore + (sharpnessScore-50)/10, 0, 100) },
    ];

    const result = {
      revision: REVISION,
      timestamp: new Date().toISOString(),
      image: { width:w, height:h },
      box: {
        x:+b.x.toFixed(2), y:+b.y.toFixed(2),
        width:+b.width.toFixed(2), height:+b.height.toFixed(2),
        area_pct:+area_pct.toFixed(4),
        center:{ x:+center.x.toFixed(2), y:+center.y.toFixed(2) },
        center_offset_pct:{ x:+center_offset_pct.x.toFixed(2), y:+center_offset_pct.y.toFixed(2) }
      },
      lighting: { brightness_mean:+mean.toFixed(3), contrast_stdev:+contrast.toFixed(3) },
      sharpness: { laplacian_variance:+lapVar.toFixed(3) },
      orientation: w>=h ? "landscape" : "portrait",
      tf: {
        backend: safeBackend(),
        version: (typeof tfVersion === 'string' && tfVersion) ? tfVersion : (tf?.version_core || tf?.version?.tfjs || "—")
      },
      refine: {
        scores: { brightness:brightnessScore, contrast:contrastScore, sharpness:sharpnessScore, global:globalScore },
        buckets
      }
    };

    lastAnalysis = result;
    session.analyses += 1;
    updateSessionStats();
    renderAnalysis(result);
    logEvt('analysis',{ ok:true, global:Math.round(globalScore) });
    return result;
  }

  function barRow(label,val){
    const pct=Math.round(val);
    const hue = pct>66? 'var(--ok)' : pct>33? 'var(--warn)' : 'var(--bad)';
    return `<div class="bar"><div>${label}</div><div class="track"><div class="fill" style="width:${pct}%;background:${hue}"></div></div><div class="num">${pct}%</div></div>`;
  }

  function renderAnalysis(a){
    $("analysisCard").style.display="";
    const kv=$("analysisKv");
    kv.innerHTML = `
      <div>Revision</div><div>${a.revision}</div>
      <div>When</div><div>${new Date(a.timestamp).toLocaleString()}</div>
      <div>Backend</div><div>${a.tf.backend} v${a.tf.version}</div>
      <div>Image</div><div>${a.image.width}×${a.image.height}</div>
      <div>Face area</div><div>${a.box.area_pct.toFixed(2)} %</div>
      <div>Center offset</div><div>X ${a.box.center_offset_pct.x.toFixed(1)} %, Y ${a.box.center_offset_pct.y.toFixed(1)} %</div>
      <div>Brightness</div><div>${a.lighting.brightness_mean.toFixed(1)}</div>
      <div>Contrast σ</div><div>${a.lighting.contrast_stdev.toFixed(1)}</div>
      <div>Sharpness (LapVar)</div><div>${a.sharpness.laplacian_variance.toFixed(0)}</div>
      <div>Orientation</div><div>${a.orientation}</div>
    `;
    const bars=$("analysisBars");
    const s=a.refine?.scores || {brightness:0,contrast:0,sharpness:0,global:0};
    const bucketHTML=(a.refine?.buckets||[]).map(b=>barRow(b.region,b.score)).join('');
    bars.innerHTML =
      barRow('Brightness', s.brightness) +
      barRow('Contrast',   s.contrast) +
      barRow('Sharpness',  s.sharpness) +
      barRow('Global',     s.global) +
      '<hr style="border:0;border-top:1px solid #223042">' +
      bucketHTML;
  }

  /* ===== Share / PDF / ZIP ===== */
  async function renderShareImage(el, watermark){
    const canvas = await html2canvas(el);
    const c=canvas.getContext('2d');
    c.save(); c.globalAlpha=0.45; c.rotate(-Math.PI/8);
    c.font=`${Math.max(20, canvas.width*0.04)}px sans-serif`;
    c.fillStyle="#000"; c.textAlign='center';
    c.fillText(watermark||'YorN • Prototype', canvas.width/2, canvas.height/2);
    c.restore();
    return canvas.toDataURL('image/png');
  }
  async function shareImage(dataUrl, hashtags){
    if(navigator.share && navigator.canShare){
      const res=await fetch(dataUrl);
      const blob=await res.blob();
      const file=new File([blob],'yorn-share.png',{type:'image/png'});
      try{ if(navigator.canShare({files:[file]})){ await navigator.share({files:[file], text:(hashtags||[]).join(' ')}); return; } } catch{}
    }
    const a=document.createElement('a'); a.href=dataUrl; a.download='yorn-share.png'; a.click();
  }
  async function handleShare(){ if(!lastAnalysis) return; const card=$("analysisCard"); const dataUrl = await renderShareImage(card, shareCfg.watermark); await shareImage(dataUrl, shareCfg.tags); logEvt('config',{ share:true, tags:shareCfg.tags }); }
  function openShareModal(){ $("wmText").value = shareCfg.watermark; $("wmTags").value = shareCfg.tags.join(' '); $("shareModal").classList.add('show'); }
  function closeShareModal(){ $("shareModal").classList.remove('show'); }
  function saveShareModal(){ shareCfg.watermark = $("wmText").value || 'YorN • Prototype'; shareCfg.tags = ($("wmTags").value || '#YorN #AI #FaceAnalysis').split(/\s+/).filter(Boolean); localStorage.setItem('yorn_wm_text', shareCfg.watermark); localStorage.setItem('yorn_wm_tags', shareCfg.tags.join(' ')); closeShareModal(); logEvt('config',{ share_settings_saved:true, watermark:shareCfg.watermark, tags:shareCfg.tags }); }

  async function buildZip(){
    try{
      if(!window.JSZip){ throw new Error('JSZip missing'); }
      const zip=new JSZip();
      const [html, js] = await Promise.all([
        fetch('index.html',{cache:'no-store'}).then(r=>r.ok?r.text():'').catch(()=> ''),
        fetch('app.js',{cache:'no-store'}).then(r=>r.ok?r.text():'').catch(()=> '')
      ]);
      zip.file('index.html', html || '<!-- DOM snapshot fallback -->\n'+document.documentElement.outerHTML);
      zip.file('app.js', js || '// Fallback: copy from editor.');
      const blob=await zip.generateAsync({type:'blob'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`yorn-${Date.now()}.zip`; a.click();
      logEvt('config',{zip_built:true});
    } catch(e){ logEvt('error',{zip_build_failed:e.message||String(e)}); }
  }

  /* ===== Crop export ===== */
  function exportCropPNG(){
    if(!lastBox) return;
    const pad = 8;
    const sx = Math.max(0, Math.floor(lastBox.x - pad));
    const sy = Math.max(0, Math.floor(lastBox.y - pad));
    const sw = Math.min(stage.width - sx, Math.floor(lastBox.width + 2*pad));
    const sh = Math.min(stage.height - sy, Math.floor(lastBox.height + 2*pad));
    const out = document.createElement('canvas'); out.width = sw; out.height = sh;
    out.getContext('2d').drawImage(stage, sx, sy, sw, sh, 0, 0, sw, sh);
    out.toBlob(b=>{
      const a=document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `yorn-face-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  }

  /* ===== Auto‑Test ===== */
  function buildAutoTestReport(){
    const full=getAllLogsText(); const start=__autoTestStartIdx||0; const chunk=full.slice(start);
    const backend=safeBackend();
    const passes=(chunk.match(/"step":"[^"]+","ok":true/g)||[]).length;
    const errors=(chunk.match(/"type":"error"/g)||[]).length;
    const roughMs=(chunk.match(/"roughLocate_ms":(\d+)/)||[])[1];
    const finalMs=(chunk.match(/"finalDetect_ms":(\d+)/)||[])[1];
    const summary=`YorN ${REVISION} • TF backend: ${backend} • refine: ${lastAnalysis && lastAnalysis.refine ? 'yes':'no'} • passes: ${passes} • errors: ${errors} • rough: ${roughMs||'—'} ms • final: ${finalMs||'—'} ms`;
    const lines=chunk.split('\n').filter(l=>/"type":"test"|"type":"detect"|"type":"analysis"|"type":"config"|"type":"error"/.test(l));
    return ['=== YorN Auto‑Test Report ===', summary, '', ...lines, '=== End Report ===',''].join('\n');
  }
  async function runAutoTest(){
    if (isBusy) return; setBusy(true);
    const fullBefore=getAllLogsText(); __autoTestStartIdx=fullBefore.length; logEvt('test',{step:'begin',rev:REVISION});
    try {
      const okS=await loadSample(); logEvt('test',{step:'sample',ok:!!okS}); if(!okS) throw new Error('sample_failed');
      const box=await detectOnce(); logEvt('test',{step:'detect',ok:!!box}); if(!box) throw new Error('detect_failed');
      const a=computeAnalysis(); logEvt('test',{step:'analysis',ok:!!a});
      const ok=!!(sourceBitmap && lastBox && lastAnalysis);
      const badge=$("readinessBadge"); if(badge){ badge.style.display='inline-block'; badge.className = ok ? 'badge ready' : 'badge blocked'; badge.textContent = ok ? 'READY' : 'BLOCKED'; }
      logEvt('test',{step:'summary',ok}); $("copyTestBtn").disabled=false; setProgress('', 'Auto‑Test complete'); setTimeout(()=>setProgress('',''),1200);
    } catch(e){
      logEvt('error',{ autoTest: e.message || String(e) }); $("copyTestBtn").disabled=false; setProgress('', 'Auto‑Test failed'); setTimeout(()=>setProgress('',''),1500);
    } finally { setBusy(false); }
  }

  /* ===== Sample & file ===== */
  async function setSourceBitmapFromBlob(blob){
    sourceBitmap = await decodeBitmapFromBlob(blob);
    pan = { x: 0, y: 0 };        // reset pan on new image
    paintBase();
    $("detectBtn").disabled=false; $("enhanceBtn").disabled=false; $("startAnalysisBtn").disabled=false;
  }

  async function loadSample(){
    try{
      const url='https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=1024&auto=format&fit=crop';
      const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status);
      const blob=await res.blob(); await setSourceBitmapFromBlob(blob);
      logEvt('detect',{sampleImage:url}); return true;
    } catch(e){ logEvt('error',{sample_failed:e.message||String(e)}); return false; }
  }

  /* ===== Panning & Centering ===== */
  stage.addEventListener('mousedown', (e) => {
    if (!sourceBitmap) return;
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    panStart = { x: pan.x, y: pan.y };
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    pan.x = panStart.x + (e.clientX - dragStart.x);
    pan.y = panStart.y + (e.clientY - dragStart.y);
    if (lastBox) drawOverlay(lastBox); else paintBase();
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  stage.addEventListener('mouseleave', () => { isDragging = false; });
  stage.addEventListener('dblclick', () => {
    if (!lastBox) return;
    const cx = lastBox.x + lastBox.width / 2;
    const cy = lastBox.y + lastBox.height / 2;
    pan.x -= (cx - stage.width / 2);
    pan.y -= (cy - stage.height / 2);
    if (lastBox) drawOverlay(lastBox); else paintBase();
    logEvt('config', { center_on_face:true, pan });
  });

  /* ===== Bindings ===== */
  $("zoom").addEventListener('input', e=>{ $("zoomLabel").textContent=(+e.target.value).toFixed(2); paintBase(); if(lastBox) drawOverlay(lastBox); });
  $("bri").addEventListener('input', e=>{ $("briLabel").textContent=(+e.target.value).toFixed(2); paintBase(); if(lastBox) drawOverlay(lastBox); });
  $("con").addEventListener('input', e=>{ $("conLabel").textContent=(+e.target.value).toFixed(2); paintBase(); if(lastBox) drawOverlay(lastBox); });
  $("rot").addEventListener('change', ()=>{ paintBase(); if(lastBox) drawOverlay(lastBox); });

  $("guideThirds").checked = overlay.thirds; $("guideSym").checked = overlay.sym; $("guideGolden").checked = overlay.golden;
  $("guideThirds").addEventListener('change', e=>{ overlay.thirds=!!e.target.checked; localStorage.setItem('yorn_thirds', JSON.stringify(overlay.thirds)); if(lastBox) drawOverlay(lastBox); });
  $("guideSym").addEventListener('change', e=>{ overlay.sym=!!e.target.checked; localStorage.setItem('yorn_sym', JSON.stringify(overlay.sym)); if(lastBox) drawOverlay(lastBox); });
  $("guideGolden").addEventListener('change', e=>{ overlay.golden=!!e.target.checked; localStorage.setItem('yorn_golden', JSON.stringify(overlay.golden)); if(lastBox) drawOverlay(lastBox); });

  $("backendSel").addEventListener('change', async ()=>{
    setBusy(true);
    try {
      faceModel = null;  // force reload
      await initTF();    // applies backend
      await loadModel();
      logEvt('config',{ backend_changed_to: $("backendSel").value || 'auto', effective:safeBackend() });
      if (sourceBitmap) { drawOverlay(lastBox || null); }
    } finally { setBusy(false); }
  });

  $("cropBtn").addEventListener('click', exportCropPNG);

  $("enhanceBtn").addEventListener('click', ()=>{
    const z=$("zoom"); z.value=Math.max(+z.value,1.5); $("zoomLabel").textContent=(+z.value).toFixed(2);
    const b=$("bri"); b.value=Math.max(+b.value,1.18); $("briLabel").textContent=(+b.value).toFixed(2);
    const c=$("con"); c.value=Math.max(+c.value,1.25); $("conLabel").textContent=(+c.value).toFixed(2);
    paintBase(); detectOnce(); logEvt('config',{enhance:'applied',zoom:+z.value,bri:+b.value,con:+c.value});
  });

  $("detectBtn").addEventListener('click', async ()=>{ setBusy(true); try{ await detectOnce(); } finally { setBusy(false); } });
  $("startAnalysisBtn").addEventListener('click', ()=>{ logEvt('analysis',{analysisRequested:true,mode:'light'}); const a=computeAnalysis(); if(a) setProgress('','Analysis ready'); });

  $("resetBtn").addEventListener('click', ()=>{
    sourceBitmap=null; faceModel=null; lastBox=null; lastAnalysis=null; allBoxes=[];
    session.detects=0; session.detectTimes=[]; session.analyses=0;
    pan = { x: 0, y: 0 };
    ctx.clearRect(0,0,stage.width,stage.height);
    $("detectBtn").disabled=true; $("enhanceBtn").disabled=true; $("startAnalysisBtn").disabled=true; $("cropBtn").disabled=true;
    $("analysisCard").style.display='none'; $("readinessBadge").style.display='none';
    $("faceStrip").innerHTML = "";
    setProgress('',''); updateSessionStats(); updateTfBadges(); logEvt('config',{reset:true});
  });

  $("fileInput").addEventListener('change', async ()=>{
    if(!$("fileInput").files.length) return;
    const f=$("fileInput").files[0];
    try{
      await setSourceBitmapFromBlob(f);
      await detectOnce();
      logEvt('detect',{ file:f.name, w:stage.width, h:stage.height });
    } catch(e){ logEvt('error',{decode_failed:e.message||String(e)}); }
  });

  $("sampleBtn").addEventListener('click', async ()=>{ const ok = await loadSample(); if(ok){ $("startAnalysisBtn").disabled=false; await detectOnce(); } });
  $("autoTestBtn").addEventListener('click', runAutoTest);

  $("copyTestBtn").addEventListener('click', async ()=>{
    try {
      const report=buildAutoTestReport();
      try{ await navigator.clipboard.writeText(report); setProgress('','Test result copied'); setTimeout(()=>setProgress('',''),1200); logEvt('config',{copiedAutoTestReport:true,length:report.length}); }
      catch { logEvt('error',{ copyAutoTestReportError:'clipboard' }); }
    } catch(e){ logEvt('error',{ copyAutoTestReportException:e.message||String(e) }); }
  });

  $("copyDiagBtn").addEventListener('click', async ()=>{
    const txt=getAllLogsText();
    try{ await navigator.clipboard.writeText(txt); setProgress('','Diagnostics copied'); setTimeout(()=>setProgress('',''),1200); logEvt('config',{copyDiagnostics:true}); }
    catch { logEvt('error',{ copyDiagnosticsFailed:'clipboard unavailable' }); }
  });
  $("clearLogsBtn").addEventListener('click', ()=>{ $("diagnostics").textContent = 'No diagnostics yet.'; });

  $("copySummaryBtn").addEventListener('click', async ()=>{
    if(!lastAnalysis) return;
    const a=lastAnalysis;
    const tfb=(a.tf&&a.tf.backend)?a.tf.backend:safeBackend();
    const tfv=(a.tf&&a.tf.version)?a.tf.version:(tf?.version_core||tf?.version?.tfjs||'—');
    const lines=[
      `YorN ${a.revision} — ${new Date(a.timestamp).toLocaleString()}`,
      `Backend: ${tfb} v${tfv}`,
      `Image: ${a.image.width}×${a.image.height}, Face area: ${a.box.area_pct.toFixed(2)}%`,
      `Center offset: X ${a.box.center_offset_pct.x.toFixed(1)}%, Y ${a.box.center_offset_pct.y.toFixed(1)}%`,
      `Brightness: ${a.lighting.brightness_mean.toFixed(1)}, Contrast σ: ${a.lighting.contrast_stdev.toFixed(1)}, Sharpness (LapVar): ${a.sharpness.laplacian_variance.toFixed(0)}`,
      `Global: ${Math.round(a.refine.scores.global)}%`
    ].join('\n');
    try{ await navigator.clipboard.writeText(lines); $("progressText").textContent = "Summary copied"; setTimeout(()=>{$("progressText").textContent="";},1200); }
    catch { $("progressText").textContent = "Copy failed"; setTimeout(()=>{$("progressText").textContent="";},1200); }
  });

  $("copyJsonBtn").addEventListener('click', async ()=>{
    if(!lastAnalysis) return;
    try{ await navigator.clipboard.writeText(JSON.stringify(lastAnalysis,null,2)); $("progressText").textContent = "Analysis JSON copied"; setTimeout(()=>{$("progressText").textContent="";},1200); }
    catch { $("progressText").textContent = "Copy failed"; setTimeout(()=>{$("progressText").textContent="";},1200); }
  });

  $("exportJsonBtn").addEventListener('click', ()=>{
    if(!lastAnalysis) return;
    const blob=new Blob([JSON.stringify(lastAnalysis,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`yorn-analysis-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  function ensureExtraButtons(){
    const group=document.getElementById('analysisBtnGroup'); if(!group) return;
    if(!document.getElementById('exportPdfBtn')){
      const pdfBtn=document.createElement('button');
      pdfBtn.id='exportPdfBtn'; pdfBtn.type='button'; pdfBtn.textContent='Export PDF';
      pdfBtn.addEventListener('click', async ()=>{
        if(!lastAnalysis) return;
        const doc=new jspdf.jsPDF({unit:'pt',format:'a4'});
        const pageW=doc.internal.pageSize.getWidth();
        const margin=32;
        doc.setFontSize(16); doc.text(`YorN Report (${REVISION})`,margin,margin+8);
        const json=JSON.stringify(lastAnalysis,null,2);
        const lines=doc.splitTextToSize(json,pageW-margin*2);
        doc.setFontSize(11); doc.text(lines, margin, margin+32);
        doc.save(`yorn-${Date.now()}.pdf`);
      });
      group.appendChild(pdfBtn);
    }
    if(!document.getElementById('shareBtn')){
      const sBtn=document.createElement('button');
      sBtn.id='shareBtn'; sBtn.type='button'; sBtn.textContent='Share';
      sBtn.addEventListener('click', handleShare);
      group.appendChild(sBtn);
    }
    if(!document.getElementById('shareSettingsBtn')){
      const setBtn=document.createElement('button');
      setBtn.id='shareSettingsBtn'; setBtn.type='button'; setBtn.textContent='Share Settings';
      setBtn.addEventListener('click', openShareModal);
      group.appendChild(setBtn);
    }
  }

  // Modal + ZIP
  $("wmSave").addEventListener('click', saveShareModal);
  $("wmCancel").addEventListener('click', closeShareModal);
  $("shareModal").addEventListener('click', (e)=>{ if(e.target.id==='shareModal') closeShareModal(); });
  $("zipBtn").addEventListener('click', buildZip);

  /* ===== Boot ===== */
  window.addEventListener('load', async ()=>{
    $("rev").textContent = REVISION; document.title = "YorN " + REVISION;
    try {
      await initTF(); logEvt('config',{tf_ready:true,backend:safeBackend(),tf_version:tfVersion});
      logEvt('config',{boot:'dom-ready',rev:REVISION}); logEvt('config',{boot:'complete'});
    } catch (e) { logEvt('error',{tf_init:e.message||String(e)}); }
    ensureExtraButtons();
  });
})();