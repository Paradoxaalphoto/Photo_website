(() => {
  "use strict";

  /* ===== Globals ===== */
  const REVISION = "1.17.5-alpha";
  const $ = id => document.getElementById(id);
  const stage = $("stage");
  const ctx = stage.getContext("2d", {willReadFrequently:true});
  let baseBitmap = null;
  let faceModel = null;
  let lastBox = null;
  let lastAnalysis = null;
  let isBusy = false;
  let tfVersion = "—";
  let __autoTestStartIdx = 0;

  const session = { detects: 0, detectTimes: [], analyses: 0 };

  /* ===== Utils ===== */
  function setBusy(v) {
    isBusy = !!v;
    $("veil").classList.toggle("show", isBusy);
    ["detectBtn","startAnalysisBtn","autoTestBtn","enhanceBtn"].forEach(id=>{
      const b=$(id); if (b) b.disabled = !!v;
    });
  }
  function logEvt(type, obj = {}) {
    const line = JSON.stringify({ time: new Date().toISOString(), type, ...obj });
    const box = $("diagnostics");
    if (box.textContent === "No diagnostics yet.") box.textContent = "";
    box.textContent += (box.textContent ? "\n" : "") + line;
    box.scrollTop = box.scrollHeight;
  }
  function getAllLogsText(){ const el=$("diagnostics"); return el ? (el.innerText||el.textContent||"") : ""; }
  function setProgress(_, msg){ $("progressText").textContent = msg || ""; }
  async function copyTextRobust(text){
    if (text == null) text = "";
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return {ok:true,via:"clipboard"}; } } catch(_){ }
    try { const ta=document.createElement("textarea"); ta.value=text; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.opacity="0"; ta.style.left="-9999px"; document.body.appendChild(ta); ta.select(); const ok=document.execCommand("copy"); document.body.removeChild(ta); if(ok) return {ok:true,via:"execCommand"}; } catch(e){ return {ok:false,via:"fallback",err:e.message||String(e)} }
    return {ok:false,via:"none",err:"No clipboard available"};
  }
  function safeBackend(){ try { return (window.tf && typeof tf.getBackend === "function") ? (tf.getBackend() || "—") : "—"; } catch { return "—"; } }
  function updateTfBadges(){ $("tfChip").textContent = safeBackend(); $("tfVer").textContent = String(tfVersion || "—"); }
  function updateSessionStats(){ const avg = session.detectTimes.length ? Math.round(session.detectTimes.reduce((a,b)=>a+b,0)/session.detectTimes.length) : "—"; $("sessStats").textContent = `${session.detects} detects • ${session.analyses} analyses`; logEvt("config",{ session:`${session.detects} detects • ${session.analyses} analyses`, avg_detect_ms: avg }); }

  /* ===== Draw ===== */
  function paintBase(){ if (!baseBitmap) return; const rot=parseFloat($("rot").value||"0")*Math.PI/180; const zoom=parseFloat($("zoom").value||"1"); const bri=parseFloat($("bri").value||"1"); const con=parseFloat($("con").value||"1"); ctx.save(); ctx.clearRect(0,0,stage.width,stage.height); ctx.filter=`brightness(${bri}) contrast(${con})`; ctx.translate(stage.width/2, stage.height/2); ctx.rotate(rot); const dw=stage.width*zoom, dh=stage.height*zoom; ctx.drawImage(baseBitmap, -dw/2, -dh/2, dw, dh); ctx.restore(); logEvt("overlay",{ painted:{ w: stage.width, h: stage.height }}); }
  function drawOverlay(box){ paintBase(); ctx.save(); ctx.strokeStyle = "#62d0ff"; ctx.lineWidth = 3; ctx.strokeRect(box.x, box.y, box.width, box.height); ctx.restore(); }

  /* ===== Image decode ===== */
  async function decodeBitmapFromBlob(blob){ return await createImageBitmap(blob); }

  /* ===== TF / Model ===== */
  async function initTF(){
    if (!window.tf) { logEvt("error",{ tf_init:"tf not present" }); throw new Error("tf missing"); }
    await tf.ready(); tfVersion = tf?.version_core || tf?.version?.tfjs || tfVersion || "—"; updateTfBadges();
    try { const t0=performance.now(); await tf.setBackend(safeBackend() || "webgl"); await tf.ready(); logEvt("config",{ warmup:"ok", backend:safeBackend(), ms: Math.round(performance.now()-t0) }); } catch(e) { logEvt("error",{ warmup:e.message||String(e) }); }
    updateTfBadges();
  }
  async function loadModel(){ if (faceModel) return; try { faceModel = await blazeface.load(); logEvt("detect",{ blazefaceReady:true }); } catch(e){ logEvt("error",{ blazeface_failed:e.message||String(e) }); throw e; } }

  /* ===== Detection with watchdog ===== */
  async function detectOnce(){ if (!baseBitmap) return null; await initTF(); await loadModel();
    const runPredict = async () => await tf.tidy(async () => { const input = tf.browser.fromPixels(stage); const preds = await faceModel.estimateFaces(input, false); if (!preds || !preds.length) return null; const p=preds[0]; const [x1,y1]=p.topLeft; const [x2,y2]=p.bottomRight; return { x:x1, y:y1, width:x2-x1, height:y2-y1 }; });
    const timed=(ms,fn)=>new Promise((resolve,reject)=>{ let done=false; const t=setTimeout(()=>{ if(!done){ done=true; reject(new Error("detect_timeout")); }}, ms); fn().then(v=>{ if(!done){ done=true; clearTimeout(t); resolve(v); }}).catch(e=>{ if(!done){ done=true; clearTimeout(t); reject(e); }}); });
    const t0=performance.now();
    try {
      let box = await timed(3000, runPredict);
      if (!box) { logEvt("error",{ detect:"no_face" }); return null; }
      const dt = Math.round(performance.now() - t0);
      lastBox = box; session.detects += 1; session.detectTimes.push(dt); drawOverlay(box);
      logEvt("detect",{ roughLocate_ms:dt, finalDetect_ms:dt, box }); updateSessionStats(); return box;
    } catch(e){
      const cur=safeBackend();
      if (e && e.message === "detect_timeout" && cur === "webgl"){
        logEvt("error",{ detect_timeout:true, backend:cur, fallback:"wasm_retry" });
        try { await tf.setBackend("wasm"); await tf.ready(); tfVersion = tf?.version_core || tf?.version?.tfjs || tfVersion || "—"; faceModel=null; await loadModel(); const t1=performance.now(); const box=await timed(3000, runPredict); if (box){ const dt=Math.round(performance.now()-t1); lastBox=box; session.detects+=1; session.detectTimes.push(dt); drawOverlay(box); logEvt("detect",{ roughLocate_ms:dt, finalDetect_ms:dt, box }); updateSessionStats(); return box; } else { logEvt("error",{ detect:"no_face_after_fallback" }); return null; } }
        catch(e2){ logEvt("error",{ detect_fallback_failed: e2.message || String(e2) }); return null; }
      } else { logEvt("error",{ detect_exception: e.message || String(e) }); return null; }
    }
  }

  /* ===== Analysis ===== */
  function computeAnalysis(){ if (!lastBox || !baseBitmap) return null; const w=stage.width, h=stage.height; const b=lastBox; const area_pct=(b.width*b.height)/(w*h)*100; const center={ x:b.x+b.width/2, y:b.y+b.height/2 }; const center_offset_pct={ x:((center.x - w/2)/(w/2))*100, y:((center.y - h/2)/(h/2))*100 };
    const img=ctx.getImageData(0,0,w,h); let sum=0, n=img.data.length/4, vals=[]; for(let i=0;i<img.data.length;i+=4){ const Y=0.2126*img.data[i]+0.7152*img.data[i+1]+0.0722*img.data[i+2]; vals.push(Y); sum+=Y; } const mean=sum/n; let v=0; for(let i=0;i<vals.length;i++){ const d=vals[i]-mean; v+=d*d; } const contrast=Math.sqrt(v/n);
    let sharp=0,m=0; const step=4; for(let y=1;y<h-1;y+=step){ for(let x=1;x<w-1;x+=step){ const idx=(y*w+x)*4; const c=img.data[idx]; const l=img.data[idx-4], r=img.data[idx+4]; const t=img.data[idx-4*w], bt=img.data[idx+4*w]; const lap=(4*c - l - r - t - bt); sharp+=lap*lap; m++; } } const lapVar=m? sharp/m : 0;
    const result={ revision:REVISION, timestamp:new Date().toISOString(), image:{width:w,height:h}, box:{ x:+b.x.toFixed(2), y:+b.y.toFixed(2), width:+b.width.toFixed(2), height:+b.height.toFixed(2), area_pct:+area_pct.toFixed(4), center:{ x:+center.x.toFixed(2), y:+center.y.toFixed(2) }, center_offset_pct:{ x:+center_offset_pct.x.toFixed(2), y:+center_offset_pct.y.toFixed(2) } }, lighting:{ brightness_mean:+mean.toFixed(3), contrast_stdev:+contrast.toFixed(3) }, sharpness:{ laplacian_variance:+lapVar.toFixed(3) }, orientation: w>=h?"landscape":"portrait", tf:{ backend:safeBackend(), version:(typeof tfVersion==='string'&&tfVersion)?tfVersion:(tf?.version_core||tf?.version?.tfjs||"—") }, refine:{} };
    lastAnalysis=result; session.analyses+=1; updateSessionStats(); renderAnalysis(result); return result; }

  function renderAnalysis(a){ $("analysisCard").style.display=""; const kv=$("analysisKv"); kv.innerHTML = `
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
    `; }

  /* ===== Social Share + Watermark ===== */
  async function renderShareImage(el, watermark = "YorN Prototype"){ const canvas = await html2canvas(el); const c = canvas.getContext("2d"); c.save(); c.globalAlpha = 0.45; c.rotate(-Math.PI/8); c.font = `${Math.max(20, canvas.width*0.04)}px sans-serif`; c.fillStyle = "#000"; c.textAlign = "center"; c.fillText(watermark, canvas.width/2, canvas.height/2); c.restore(); return canvas.toDataURL("image/png"); }
  async function shareImage(dataUrl, hashtags=["#YorN","#AI","#Attractiveness"]){ if(navigator.share && navigator.canShare){ const res = await fetch(dataUrl); const blob = await res.blob(); const file = new File([blob], "yorn-share.png", { type: "image/png" }); try { if(navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], text:hashtags.join(" ") }); return; } } catch{} } const a=document.createElement('a'); a.href=dataUrl; a.download='yorn-share.png'; a.click(); }
  async function handleShare(){ if(!lastAnalysis) return; const card=document.getElementById("analysisCard"); const dataUrl=await renderShareImage(card,"YorN • Prototype"); await shareImage(dataUrl,["#YorN","#AI","#FaceAnalysis"]); }

  /* ===== Auto‑Test ===== */
  function buildAutoTestReport(){ const full=getAllLogsText(); const start=__autoTestStartIdx||0; const chunk=full.slice(start); const backend=safeBackend(); const passes=(chunk.match(/"step":"[^"]+","ok":true/g)||[]).length; const errors=(chunk.match(/"type":"error"/g)||[]).length; const roughMs=(chunk.match(/"roughLocate_ms":(\d+)/)||[])[1]; const finalMs=(chunk.match(/"finalDetect_ms":(\d+)/)||[])[1]; const summary=`YorN ${REVISION} • TF backend: ${backend} • refine: ${lastAnalysis && lastAnalysis.refine ? 'yes':'no'} • passes: ${passes} • errors: ${errors} • rough: ${roughMs||'—'} ms • final: ${finalMs||'—'} ms`; const lines=chunk.split('\n').filter(l=>/"type":"test"|"type":"detect"|"type":"analysis"|"type":"config"|"type":"error"/.test(l)); return ['=== YorN Auto‑Test Report ===', summary, '', ...lines, '=== End Report ===',''].join('\n'); }
  async function runAutoTest(){ if (isBusy) return; setBusy(true); const fullBefore=getAllLogsText(); __autoTestStartIdx=fullBefore.length; logEvt("test",{step:"begin",rev:REVISION}); try { const okS=await loadSample(); logEvt("test",{step:"sample",ok:!!okS}); if(!okS) throw new Error("sample_failed"); const box=await detectOnce(); logEvt("test",{step:"detect",ok:!!box}); if(!box) throw new Error("detect_failed"); const a=computeAnalysis(); logEvt("test",{step:"analysis",ok:!!a}); const ok=!!(baseBitmap && lastBox && lastAnalysis); const badge=$("readinessBadge"); if(badge){ badge.style.display='inline-block'; badge.className = ok ? 'badge ready' : 'badge blocked'; badge.textContent = ok ? 'READY' : 'BLOCKED'; } logEvt("test",{step:"summary",ok}); $("copyTestBtn").disabled=false; setProgress('', 'Auto‑Test complete'); setTimeout(()=>setProgress('',''),1200); } catch(e){ logEvt("error",{ autoTest: e.message || String(e) }); $("copyTestBtn").disabled=false; setProgress('', 'Auto‑Test failed'); setTimeout(()=>setProgress('',''),1500); } finally { setBusy(false); } }

  /* ===== File & Sample ===== */
  async function loadSample(){ try { const url="https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=1024&auto=format&fit=crop"; const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status); const blob=await res.blob(); baseBitmap=await decodeBitmapFromBlob(blob); paintBase(); $("detectBtn").disabled=false; $("enhanceBtn").disabled=false; logEvt("detect",{ sampleImage:url }); return true; } catch(e){ logEvt("error",{ sample_failed:e.message||String(e) }); return false; } }

  /* ===== Bindings ===== */
  $("zoom").addEventListener("input", e=>{ $("zoomLabel").textContent=(+e.target.value).toFixed(2); paintBase(); });
  $("bri").addEventListener("input", e=>{ $("briLabel").textContent=(+e.target.value).toFixed(2); paintBase(); });
  $("con").addEventListener("input", e=>{ $("conLabel").textContent=(+e.target.value).toFixed(2); paintBase(); });
  $("rot").addEventListener("change", paintBase);

  $("enhanceBtn").addEventListener("click", ()=>{ const z=$("zoom"); z.value=Math.max(+z.value,1.5); $("zoomLabel").textContent=(+z.value).toFixed(2); const b=$("bri"); b.value=Math.max(+b.value,1.18); $("briLabel").textContent=(+b.value).toFixed(2); const c=$("con"); c.value=Math.max(+c.value,1.25); $("conLabel").textContent=(+c.value).toFixed(2); paintBase(); detectOnce(); logEvt("config",{ enhance:"applied", zoom:+z.value, bri:+b.value, con:+c.value }); });

  $("detectBtn").addEventListener("click", async ()=>{ setBusy(true); try { await detectOnce(); } finally { setBusy(false); } });
  $("startAnalysisBtn").addEventListener("click", ()=>{ logEvt("analysis",{ analysisRequested:true, mode:"light" }); const a=computeAnalysis(); if(a) setProgress('', 'Analysis ready'); });

  $("resetBtn").addEventListener("click", ()=>{ baseBitmap=null; faceModel=null; lastBox=null; lastAnalysis=null; session.detects=0; session.detectTimes=[]; session.analyses=0; ctx.clearRect(0,0,stage.width,stage.height); $("detectBtn").disabled=true; $("enhanceBtn").disabled=true; $("startAnalysisBtn").disabled=true; $("analysisCard").style.display="none"; $("readinessBadge").style.display="none"; setProgress('',''); updateSessionStats(); logEvt("config",{ reset:true }); });

  $("fileInput").addEventListener("change", async ()=>{ if (!$("fileInput").files.length) return; const f=$("fileInput").files[0]; try { baseBitmap=await decodeBitmapFromBlob(f); paintBase(); $("detectBtn").disabled=false; $("enhanceBtn").disabled=false; $("startAnalysisBtn").disabled=false; logEvt("detect",{ file:f.name, w:baseBitmap.width, h:baseBitmap.height }); } catch(e){ logEvt("error",{ decode_failed:e.message||String(e) }); } });

  $("sampleBtn").addEventListener("click", async ()=>{ await loadSample(); $("startAnalysisBtn").disabled=false; });
  $("autoTestBtn").addEventListener("click", runAutoTest);

  $("copyTestBtn").addEventListener("click", async ()=>{ try { const report=buildAutoTestReport(); const res=await copyTextRobust(report); if(res.ok){ logEvt("config",{ copiedAutoTestReport:true, via:res.via, length:report.length }); setProgress('', 'Test result copied'); setTimeout(()=>setProgress('',''),1200); } else { logEvt("error",{ copyAutoTestReportError: res.err || 'unknown', via:res.via }); } } catch(e){ logEvt("error",{ copyAutoTestReportException: e.message || String(e) }); } });

  $("copyDiagBtn").addEventListener("click", async ()=>{ const txt=getAllLogsText(); const res=await copyTextRobust(txt); if(res.ok){ setProgress('', 'Diagnostics copied'); setTimeout(()=>setProgress('',''),1200); logEvt("config",{ copyDiagnostics:true }); } else { logEvt("error",{ copyDiagnosticsFailed:res.err || 'unknown' }); } });
  $("clearLogsBtn").addEventListener("click", ()=>{ $("diagnostics").textContent = "No diagnostics yet."; });

  $("copySummaryBtn").addEventListener("click", async ()=>{ if(!lastAnalysis) return; const a=lastAnalysis; const tfb=(a.tf&&a.tf.backend)?a.tf.backend:safeBackend(); const tfv=(a.tf&&a.tf.version)?a.tf.version:(tf?.version_core||tf?.version?.tfjs||"—"); const lines=[ `YorN ${a.revision} — ${new Date(a.timestamp).toLocaleString()}`, `Backend: ${tfb} v${tfv}`, `Image: ${a.image.width}×${a.image.height}, Face area: ${a.box.area_pct.toFixed(2)}%`, `Center offset: X ${a.box.center_offset_pct.x.toFixed(1)}%, Y ${a.box.center_offset_pct.y.toFixed(1)}%`, `Brightness: ${a.lighting.brightness_mean.toFixed(1)}, Contrast σ: ${a.lighting.contrast_stdev.toFixed(1)}, Sharpness (LapVar): ${a.sharpness.laplacian_variance.toFixed(0)}` ].join("\n"); const r=await copyTextRobust(lines); $("progressText").textContent = r.ok ? "Summary copied" : "Copy failed"; setTimeout(()=>{$("progressText").textContent="";},1200); });

  $("copyJsonBtn").addEventListener("click", async ()=>{ if(!lastAnalysis) return; const r=await copyTextRobust(JSON.stringify(lastAnalysis,null,2)); $("progressText").textContent = r.ok ? "Analysis JSON copied" : "Copy failed"; setTimeout(()=>{$("progressText").textContent="";},1200); });

  $("exportJsonBtn").addEventListener("click", ()=>{ if(!lastAnalysis) return; const blob=new Blob([JSON.stringify(lastAnalysis,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`yorn-analysis-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

  // Append Export PDF + Share buttons (to preserve your HTML)
  function ensureExtraButtons(){
    const group = document.getElementById('analysisBtnGroup');
    if (!group) return;
    if (!document.getElementById('exportPdfBtn')){
      const pdfBtn=document.createElement('button');
      pdfBtn.id='exportPdfBtn'; pdfBtn.type='button'; pdfBtn.textContent='Export PDF';
      pdfBtn.addEventListener('click', async ()=>{
        if(!lastAnalysis) return;
        const doc = new jspdf.jsPDF({ unit:'pt', format:'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 32;
        doc.setFontSize(16);
        doc.text(`YorN Report (${REVISION})`, margin, margin+8);
        const json = JSON.stringify(lastAnalysis, null, 2);
        const lines = doc.splitTextToSize(json, pageW - margin*2);
        doc.setFontSize(11);
        doc.text(lines, margin, margin+32);
        doc.save(`yorn-${Date.now()}.pdf`);
      });
      group.appendChild(pdfBtn);
    }
    if (!document.getElementById('shareBtn')){
      const sBtn=document.createElement('button');
      sBtn.id='shareBtn'; sBtn.type='button'; sBtn.textContent='Share';
      sBtn.addEventListener('click', handleShare);
      group.appendChild(sBtn);
    }
  }

  /* ===== Boot ===== */
  window.addEventListener("load", async ()=>{
    $("rev").textContent = REVISION;
    try { await initTF(); logEvt("config",{ tf_ready:true, backend:safeBackend(), tf_version: tfVersion }); updateTfBadges(); logEvt("config",{ boot:"dom-ready", rev:REVISION }); logEvt("config",{ boot:"complete" }); } catch(e){ logEvt("error",{ tf_init: e.message || String(e) }); }
    ensureExtraButtons();
  });

})();