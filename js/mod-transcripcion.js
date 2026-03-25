/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v2.0 · 2026-03-25 · Fiscalito / UMAG
   =========================================================
   UI tipo referencia: subir docs · vincular caso · tarjetas
   formato · chips de modo · monkey-patch inmediato (sin DOM)
   ========================================================= */

/* ── ESTADO ── */
const transcripcion = {
  isRecording:false, mediaRecorder:null, audioChunks:[],
  audioFile:null, audioUrl:null,
  baseDocText:'', baseDocName:'',
  rawText:'', structuredText:'', summary:'',
  segments:[], step:'upload',
  isProcessing:false, isGeneratingSummary:false,
  selectedMode:null, linkedCase:null,
};

/* ────────────────────────────────────────────────────────
   MONKEY-PATCH INMEDIATO — intercepts showFnPanel('F11')
   No usa DOMContentLoaded: retry cada 50ms hasta que la
   función esté disponible (el módulo carga después del core)
   ──────────────────────────────────────────────────────── */
(function patchShowFnPanel() {
  const tryPatch = () => {
    if (typeof window.showFnPanel !== 'function') { setTimeout(tryPatch, 50); return; }
    if (window.__f11Patched) return;
    window.__f11Patched = true;
    const orig = window.showFnPanel;
    window.showFnPanel = function(code) {
      if (code === 'F11') { renderF11Panel(); return; }
      orig.call(this, code);
    };
  };
  tryPatch();
})();

/* ────────────────────────────────────────────────────────
   RENDER PRINCIPAL DEL PANEL F11
   ──────────────────────────────────────────────────────── */
function renderF11Panel() {
  const panel  = document.getElementById('fnPanel');
  const msgs   = document.getElementById('msgs');
  const ragBar = document.getElementById('ragBar');
  if (!panel) return;
  if (msgs)   msgs.style.display   = 'none';
  if (ragBar) ragBar.style.display = 'none';
  panel.style.cssText = 'display:flex;flex-direction:column;padding:0;overflow:hidden;';
  panel.innerHTML = buildF11HTML();
  buildF11Chips();
  updateTransInputBar();
}
function updateTransPanel() { renderF11Panel(); }

/* ── HTML principal ── */
function buildF11HTML() {
  const linked = transcripcion.linkedCase;

  const docsSection = `<div class="f11-section">
    <div class="f11-row" style="margin-bottom:8px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12v10H2z"/><path d="M5 3V1.5M11 3V1.5"/></svg>
      <span class="f11-section-title">Documentos de la Función</span>
    </div>
    <label class="f11-upload-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Subir documentos
      <input type="file" accept=".pdf,.docx,.doc,.txt" style="display:none" onchange="handleTransDocUpload(this)"/>
    </label>
    ${transcripcion.audioFile
      ? `<div class="f11-file-chip">🔊 ${esc(transcripcion.audioFile.name)} <button onclick="transcripcion.audioFile=null;transcripcion.audioUrl=null;renderF11Panel()" class="f11-chip-del">✕</button></div>`
      : ''}
    ${transcripcion.baseDocName
      ? `<div class="f11-file-chip">📄 ${esc(transcripcion.baseDocName)} <button onclick="clearTransDoc()" class="f11-chip-del">✕</button></div>`
      : `<div class="f11-empty-docs">Sin documentos cargados para esta función</div>`}
    ${transcripcion.audioUrl ? `<audio controls src="${transcripcion.audioUrl}" style="width:100%;margin-top:8px;height:32px"></audio>` : ''}
  </div>`;

  const caseSection = `<div class="f11-section f11-case-section" onclick="toggleF11CaseDropdown()">
    <div class="f11-row" style="justify-content:space-between">
      <div class="f11-row" style="gap:7px">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2h12v12H2z"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="9" y2="8"/></svg>
        ${linked
          ? `<span style="color:var(--gold);font-weight:500;font-size:11.5px">📋 ${esc(linked.name)}${linked.rol?' · '+esc(linked.rol):''}</span>`
          : `<span style="font-size:11.5px;color:var(--text-dim)">Vincular con un Caso</span>`}
      </div>
      <span style="font-size:10px;color:var(--text-muted)">${linked?'✓ vinculado':'opcional'}</span>
    </div>
    ${linked ? `<button class="btn-sm" style="font-size:9.5px;padding:2px 8px;margin-top:6px" onclick="event.stopPropagation();unlinkF11Case()">Desvincular</button>` : ''}
  </div>
  <div id="f11CaseDropdown" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-height:150px;overflow-y:auto;">
    ${(typeof allCases !== 'undefined' ? allCases : []).slice(0,20).map(c =>
      `<div class="f11-case-option" onclick="linkF11Case('${c.id}')">
        <span style="font-weight:500;font-size:12px">${esc(c.name)}</span>
        ${c.rol?`<span style="font-size:10px;color:var(--text-muted)"> · ${esc(c.rol)}</span>`:''}
      </div>`
    ).join('')}
  </div>`;

  // Result view
  if (transcripcion.step === 'result' && (transcripcion.structuredText || transcripcion.rawText)) {
    const text = transcripcion.structuredText || transcripcion.rawText;
    return `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-result-actions">
        <button class="btn-sm" onclick="copyTranscripcion()">📋 Copiar</button>
        <button class="btn-sm" onclick="downloadTransWord()">⬇ Descargar</button>
        ${!transcripcion.summary ? '<button class="btn-sm" onclick="generateTransSummary()">📊 Resumen IA</button>' : ''}
        <button class="btn-cancel" style="margin-left:auto" onclick="resetTranscripcion()">↺ Nueva</button>
      </div>
      ${transcripcion.summary ? `<div class="trans-summary-box"><strong style="font-size:11px;color:var(--gold)">📊 Resumen</strong><div style="font-size:12px;margin-top:5px;line-height:1.6">${md(transcripcion.summary)}</div></div>` : ''}
      <div class="trans-result-box">${md(text)}</div>
    </div>`;
  }

  // Processing
  if (transcripcion.isProcessing) {
    return `<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-processing">
        <div class="typing" style="justify-content:center"><div class="da"></div><div class="da"></div><div class="da"></div></div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">
          ${transcripcion.step==='transcribing' ? 'Transcribiendo audio… esto puede tomar unos minutos' : 'Estructurando como acta formal…'}
        </div>
      </div>
    </div>`;
  }

  // After transcription
  if (transcripcion.step === 'structure' && transcripcion.rawText) {
    return `<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-section">
        <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Transcripción obtenida</div>
        <div class="trans-raw-box">${esc(transcripcion.rawText.substring(0,600))}${transcripcion.rawText.length>600?'…':''}</div>
      </div>
      <div class="f11-action-row">
        <button class="btn-save" style="flex:1" onclick="structureTranscripcion()">📋 Estructurar como Acta</button>
        <button class="btn-sm" onclick="generateTransSummary()">📊 Resumen</button>
        <button class="btn-cancel" onclick="resetTranscripcion()">↺ Reiniciar</button>
      </div>
    </div>`;
  }

  // Default: upload screen
  return `<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
    ${docsSection}
    ${caseSection}

    <div class="f11-fn-card">
      <div class="f11-fn-card-header">
        <span class="f11-fn-badge">F11</span>
        <span class="f11-fn-title">Función F11 – Transcripción de Actas</span>
      </div>
      <div class="f11-fn-desc">
        Transcribe archivos de audio o video de declaraciones a texto estructurado. Suba el archivo de
        audio/video (MP3, M4A, WAV, MP4, MOV) y opcionalmente un documento base para generar un texto
        refundido con formato de acta.
      </div>
    </div>

    <div class="f11-format-card">
      <div class="f11-format-label">FORMATO SUGERIDO</div>
      <div class="f11-format-body">
        Suba un archivo de audio o video para transcribir. Puede vincular un expediente para incluir datos del caso en
        el acta resultante.<br><br>
        <em>Formatos soportados: MP3, M4A, WAV, AAC, MP4, MOV, WebM y grabaciones iPhone.</em>
      </div>
    </div>

    <div class="f11-note">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r=".5" fill="#f59e0b" stroke="none"/></svg>
      La transcripción se realiza mediante IA. Revise siempre el texto resultante para verificar precisión de nombres, fechas y términos técnicos.
    </div>
  </div>`;
}

/* ── Chips de modo ── */
function buildF11Chips() {
  const row = document.getElementById('fnChipsRow');
  if (!row) return;
  const modes = [
    { id:'solo',               label:'+ Solo transcribir' },
    { id:'pregunta_respuesta',  label:'+ Formato pregunta-respuesta' },
    { id:'con_expediente',      label:'+ Con datos del expediente' },
  ];
  row.innerHTML = modes.map(m =>
    `<button class="fn-chip ${transcripcion.selectedMode===m.id?'fn-chip-active':''}"
       onclick="selectF11Mode('${m.id}')">${esc(m.label)}</button>`
  ).join('');
}

function selectF11Mode(mode) {
  transcripcion.selectedMode = transcripcion.selectedMode === mode ? null : mode;
  buildF11Chips();
  const hint = document.getElementById('fnHint');
  const hints = { solo:'Solo transcribir', pregunta_respuesta:'Formato pregunta-respuesta', con_expediente:'Con datos del expediente' };
  if (hint) hint.textContent = hints[mode] || 'Suba audio/video para transcribir';
}

/* ── Input bar ── */
function updateTransInputBar() {
  const hint = document.getElementById('fnHint');
  const ah   = document.querySelector('.input-attach-hint');
  if (hint) hint.textContent = 'Suba audio/video para transcribir. Vincule un expediente para incluir datos en el acta.';
  if (ah)   ah.textContent   = 'Audio/Video';
  const fi = document.getElementById('fnDocInput');
  if (fi) {
    fi.accept = 'audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.webm,.ogg,.aac';
    fi.onchange = function(e) {
      const file = e.target.files?.[0]; if (!file) return;
      transcripcion.audioFile = file;
      transcripcion.audioUrl  = URL.createObjectURL(file);
      transcripcion.step      = 'upload';
      renderF11Panel();
      showToast(`✓ ${file.name} cargado`);
    };
  }
}

/* ── Case dropdown ── */
function toggleF11CaseDropdown() {
  const dd = document.getElementById('f11CaseDropdown');
  if (dd) dd.style.display = dd.style.display==='none' ? 'block' : 'none';
}
function linkF11Case(caseId) {
  const c = (typeof allCases!=='undefined'?allCases:[]).find(x=>x.id===caseId);
  if (c) { transcripcion.linkedCase = c; showToast(`✓ Vinculado: ${c.name}`); }
  renderF11Panel();
}
function unlinkF11Case() { transcripcion.linkedCase = null; renderF11Panel(); }

/* ── File uploads ── */
function handleTransAudioUpload(input) {
  const file = input.files?.[0]; if (!file) return;
  transcripcion.audioFile = file;
  transcripcion.audioUrl  = URL.createObjectURL(file);
  renderF11Panel(); showToast(`✓ ${file.name}`); input.value='';
}
function handleTransDocUpload(input) {
  const file = input.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { transcripcion.baseDocText=e.target.result||''; transcripcion.baseDocName=file.name; renderF11Panel(); showToast(`✓ ${file.name}`); };
  reader.readAsText(file); input.value='';
}
function clearTransDoc() { transcripcion.baseDocText=''; transcripcion.baseDocName=''; renderF11Panel(); }

/* ── Grabación ── */
function startTransRecording() {
  navigator.mediaDevices.getUserMedia({audio:true})
    .then(stream => {
      transcripcion.audioChunks=[]; transcripcion.mediaRecorder=new MediaRecorder(stream);
      transcripcion.mediaRecorder.ondataavailable = e => transcripcion.audioChunks.push(e.data);
      transcripcion.mediaRecorder.onstop = () => {
        const blob=new Blob(transcripcion.audioChunks,{type:'audio/webm'});
        transcripcion.audioFile=new File([blob],'grabacion.webm',{type:'audio/webm'});
        transcripcion.audioUrl=URL.createObjectURL(blob);
        transcripcion.isRecording=false; stream.getTracks().forEach(t=>t.stop()); renderF11Panel(); showToast('✓ Grabado');
      };
      transcripcion.mediaRecorder.start(); transcripcion.isRecording=true; renderF11Panel();
    }).catch(err=>showToast('⚠ Micrófono: '+err.message));
}
function stopTransRecording() { if(transcripcion.mediaRecorder&&transcripcion.isRecording) transcripcion.mediaRecorder.stop(); }

/* ── Transcribir ── */
async function transcribeAudio() {
  if (!transcripcion.audioFile) { showToast('⚠ Carga un archivo de audio primero'); return; }
  const inputBox = document.getElementById('inputBox');
  const extraInstr = inputBox?.value.trim()||''; if(inputBox) inputBox.value='';
  transcripcion.step='transcribing'; transcripcion.isProcessing=true; renderF11Panel();
  try {
    const ep  = typeof CHAT_ENDPOINT!=='undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const lnk = transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const modeCtx = transcripcion.selectedMode==='pregunta_respuesta' ? 'Formato PREGUNTA-RESPUESTA'
      : transcripcion.selectedMode==='con_expediente' ? 'Incluye datos del expediente en el encabezado'
      : 'Transcripción directa';
    const reader = new FileReader();
    const b64 = await new Promise((res,rej) => { reader.onload=e=>res(e.target.result.split(',')[1]); reader.onerror=rej; reader.readAsDataURL(transcripcion.audioFile); });
    const body = { model:'claude-sonnet-4-20250514', max_tokens:4000,
      system:`Eres Fiscalito. Transcribe el audio fielmente. Identifica hablantes: [FISCAL],[DECLARANTE],[TESTIGO],[ACTUARIO]. Partes inaudibles: [INAUDIBLE]. ${modeCtx}. ${lnk?'Expediente: '+lnk.name:''} ${extraInstr?'Instrucción adicional: '+extraInstr:''}`,
      messages:[{role:'user',content:[{type:'text',text:`Transcribe este audio.${extraInstr?' '+extraInstr:''}`},...(b64?[{type:'document',source:{type:'base64',media_type:transcripcion.audioFile.type||'audio/webm',data:b64}}]:[])]}] };
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data=await resp.json();
    const reply=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    if(!reply.trim()) throw new Error('Sin respuesta de la IA');
    transcripcion.rawText=reply; transcripcion.step='structure'; transcripcion.isProcessing=false;
    renderF11Panel(); showToast('✓ Transcripción completa');
  } catch(err) { transcripcion.isProcessing=false; transcripcion.step='upload'; renderF11Panel(); showToast('⚠ '+err.message); }
}

/* ── Estructurar ── */
async function structureTranscripcion() {
  if (!transcripcion.rawText) return;
  transcripcion.step='structure'; transcripcion.isProcessing=true; renderF11Panel();
  try {
    const ep  = typeof CHAT_ENDPOINT!=='undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const lnk = transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const body = { model:'claude-sonnet-4-20250514', max_tokens:4000,
      system:`Eres Fiscalito. Estructura la transcripción como ACTA FORMAL institucional UMAG. Expediente: ${lnk?.name||'[EXPEDIENTE]'} | ROL: ${lnk?.rol||'[ROL]'} | Fecha: ${new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}. ${transcripcion.baseDocText?'Documento base disponible.':''}`,
      messages:[{role:'user',content:`Estructura como acta formal:\n\n${transcripcion.rawText}`}] };
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.structuredText=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.step='result'; transcripcion.isProcessing=false; renderF11Panel(); showToast('✓ Acta estructurada');
  } catch(err) { transcripcion.isProcessing=false; transcripcion.step='structure'; renderF11Panel(); showToast('⚠ '+err.message); }
}

/* ── Resumen ── */
async function generateTransSummary() {
  if (!transcripcion.rawText) return;
  transcripcion.isGeneratingSummary=true; renderF11Panel();
  try {
    const ep = typeof CHAT_ENDPOINT!=='undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const body={ model:'claude-sonnet-4-20250514', max_tokens:600,
      system:'Eres Fiscalito. Resumen ejecutivo en 3-5 puntos clave.',
      messages:[{role:'user',content:`Resumen:\n\n${transcripcion.rawText.substring(0,2500)}`}] };
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.summary=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.isGeneratingSummary=false; renderF11Panel();
  } catch(err) { transcripcion.isGeneratingSummary=false; renderF11Panel(); showToast('⚠ '+err.message); }
}

/* ── Acciones resultado ── */
function copyTranscripcion() { navigator.clipboard.writeText(transcripcion.structuredText||transcripcion.rawText); showToast('✓ Copiado'); }
function downloadTransWord() {
  const blob=new Blob([transcripcion.structuredText||transcripcion.rawText],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`acta_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(a.href);
}
function resetTranscripcion() {
  if(transcripcion.audioUrl) URL.revokeObjectURL(transcripcion.audioUrl);
  Object.assign(transcripcion,{isRecording:false,audioChunks:[],audioFile:null,audioUrl:null,baseDocText:'',baseDocName:'',rawText:'',structuredText:'',summary:'',segments:[],step:'upload',isProcessing:false,isGeneratingSummary:false,selectedMode:null});
  renderF11Panel(); buildF11Chips();
}
function switchTransView() { renderF11Panel(); }

/* ── CSS ── */
(function injectTransCSS() {
  if (document.getElementById('f11-css')) return;
  const s=document.createElement('style'); s.id='f11-css';
  s.textContent=`
.f11-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:11px 14px;}
.f11-case-section{cursor:pointer;transition:border-color .14s;}
.f11-case-section:hover{border-color:var(--border2);}
.f11-row{display:flex;align-items:center;gap:6px;}
.f11-section-title{font-size:12px;font-weight:500;color:var(--text-dim);}
.f11-upload-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-dim);padding:6px 14px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:'Inter',sans-serif;transition:all .14s;}
.f11-upload-btn:hover{border-color:var(--gold-dim);color:var(--gold);}
.f11-empty-docs{font-size:11.5px;color:var(--text-muted);margin-top:7px;}
.f11-file-chip{display:inline-flex;align-items:center;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:3px 10px;border-radius:12px;font-size:11px;margin-top:6px;}
.f11-chip-del{background:none;border:none;cursor:pointer;color:var(--text-muted);margin-left:4px;padding:0;font-size:11px;}
.f11-case-option{padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--border);}
.f11-case-option:hover{background:var(--surface2);}
.f11-fn-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px;}
.f11-fn-card-header{display:flex;align-items:center;gap:9px;margin-bottom:8px;}
.f11-fn-badge{background:var(--gold);color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:'DM Mono',monospace;}
.f11-fn-title{font-size:12.5px;font-weight:600;color:var(--text);}
.f11-fn-desc{font-size:12px;color:var(--text-dim);line-height:1.6;}
.f11-format-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px;}
.f11-format-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px;}
.f11-format-body{font-size:12px;color:var(--text-dim);line-height:1.6;}
.f11-note{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text-muted);padding:8px 12px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:var(--radius);line-height:1.5;}
.f11-processing{text-align:center;padding:30px;color:var(--text-muted);}
.f11-result-actions{display:flex;gap:6px;flex-wrap:wrap;}
.f11-action-row{display:flex;gap:7px;flex-wrap:wrap;}
.fn-chip-active{background:var(--gold-glow)!important;border-color:var(--gold-dim)!important;color:var(--gold)!important;}
.trans-raw-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:11.5px;line-height:1.65;max-height:130px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim);}
.trans-summary-box{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:12px 14px;}
.trans-result-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:12.5px;line-height:1.75;max-height:calc(100vh - 300px);overflow-y:auto;}
.trans-result-box h1,.trans-result-box h2,.trans-result-box h3{font-family:'EB Garamond',serif;color:var(--gold);}
`;
  document.head.appendChild(s);
})();
