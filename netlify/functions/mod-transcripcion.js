/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v3.1 · 2026-03-26 · Fiscalito / UMAG
   =========================================================
   Mejoras v3.1:
   · Soporte completo de formatos: MP3, WAV, M4A, AAC, OGG,
     OPUS, FLAC, WMA, AMR, 3GP, CAF, WebM, AIFF, MKA,
     MP4, MOV, AVI, MKV, WMV, FLV
   · Endpoint dedicado /transcribe (Whisper + ElevenLabs + Claude)
   · Compresión automática a 16kHz mono WAV (óptimo para voz)
   · Respeta límite de 4.5 MB de Netlify Functions
   · Detección y corrección automática de MIME types
   ========================================================= */

/* ── CONSTANTES ── */
const TRANS_MAX_INPUT_MB = 50;                       // máx que acepta la UI
const TRANS_MAX_INPUT    = TRANS_MAX_INPUT_MB * 1024 * 1024;
const TRANS_MAX_PAYLOAD  = 4.5 * 1024 * 1024;        // límite real Netlify (base64)
const TRANSCRIBE_EP      = '/.netlify/functions/transcribe';

/** Extensiones aceptadas */
const TRANS_EXTS = [
  '.mp3','.wav','.m4a','.aac','.ogg','.oga','.opus','.flac',
  '.wma','.amr','.aiff','.aif','.caf','.webm','.weba','.3gp',
  '.spx','.ac3','.mka',
  '.mp4','.m4v','.mov','.avi','.mkv','.wmv','.flv','.ts','.mts',
];
const TRANS_ACCEPT = 'audio/*,video/*,' + TRANS_EXTS.join(',');

/** Mapa extensión → MIME */
const MIME = {
  mp3:'audio/mpeg',wav:'audio/wav',wave:'audio/wav',m4a:'audio/mp4',
  aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/opus',
  flac:'audio/flac',wma:'audio/x-ms-wma',amr:'audio/amr',
  aiff:'audio/aiff',aif:'audio/aiff',caf:'audio/x-caf',
  webm:'audio/webm',weba:'audio/webm','3gp':'audio/3gpp',
  '3gpp':'audio/3gpp',spx:'audio/ogg',ac3:'audio/ac3',
  mka:'audio/x-matroska',
  mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',
  avi:'video/x-msvideo',mkv:'video/x-matroska',
  wmv:'video/x-ms-wmv',flv:'video/x-flv',ts:'video/mp2t',mts:'video/mp2t',
};

/* ── ESTADO ── */
const transcripcion = {
  isRecording:false, mediaRecorder:null, audioChunks:[],
  audioFile:null, audioUrl:null,
  baseDocText:'', baseDocName:'',
  rawText:'', structuredText:'', summary:'',
  segments:[], step:'upload',
  isProcessing:false, isGeneratingSummary:false,
  selectedMode:null, linkedCase:null,
  transcribeProvider:null,
};

/* ────────────────────────────────────────────────────────
   MONKEY-PATCH — intercepts showFnPanel('F11')
   ──────────────────────────────────────────────────────── */
(function patchShowFnPanel(){
  const tryPatch=()=>{
    if(typeof window.showFnPanel!=='function'){setTimeout(tryPatch,50);return;}
    if(window.__f11Patched)return;
    window.__f11Patched=true;
    const orig=window.showFnPanel;
    window.showFnPanel=function(code){
      if(code==='F11'){renderF11Panel();return;}
      orig.call(this,code);
    };
  };
  tryPatch();
})();

/* ────────────────────────────────────────────────────────
   UTILIDADES
   ──────────────────────────────────────────────────────── */
const esc = typeof escHtml==='function' ? escHtml : s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
function ext(name){if(!name)return'';const p=name.toLowerCase().split('.');return p.length>1?p.pop():'';}
function mimeOf(file){const e=ext(file.name);const m=MIME[e];if(!file.type||file.type==='application/octet-stream')return m||'audio/mpeg';return file.type;}
function isAV(file){if(!file)return false;const e=ext(file.name);return TRANS_EXTS.some(x=>x.replace('.','')=== e)||(file.type&&(file.type.startsWith('audio/')||file.type.startsWith('video/')));}
function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}

/* ────────────────────────────────────────────────────────
   COMPRESIÓN CLIENT-SIDE — audio → 16kHz mono WAV
   Óptimo para voz: reduce archivos 10-20x,
   mantiene calidad suficiente para transcripción.
   ──────────────────────────────────────────────────────── */
async function compressForTranscription(file){
  const TARGET_SR = 16000;  // 16kHz — estándar para speech recognition
  const CHANNELS  = 1;       // mono

  const arrayBuf = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext||window.webkitAudioContext)({sampleRate:TARGET_SR});
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuf);

    // Downmix a mono y resample a 16kHz
    const offline = new OfflineAudioContext(CHANNELS, Math.ceil(decoded.duration*TARGET_SR), TARGET_SR);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();

    // Encode WAV
    const wavBlob = encodeWav(rendered);
    const baseName = file.name.replace(/\.[^.]+$/,'');
    return new File([wavBlob], baseName+'_16k.wav', {type:'audio/wav'});
  } finally {
    audioCtx.close();
  }
}

function encodeWav(buf){
  const ch=buf.numberOfChannels, sr=buf.sampleRate, bps=16;
  const bytesPer=bps/8, block=ch*bytesPer, dataLen=buf.length*block;
  const ab=new ArrayBuffer(44+dataLen), v=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+dataLen,true);ws(8,'WAVE');ws(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*block,true);
  v.setUint16(32,block,true);v.setUint16(34,bps,true);
  ws(36,'data');v.setUint32(40,dataLen,true);
  const chData=[];for(let c=0;c<ch;c++)chData.push(buf.getChannelData(c));
  let off=44;
  for(let i=0;i<buf.length;i++){
    for(let c=0;c<ch;c++){
      let s=chData[c][i];s=Math.max(-1,Math.min(1,s));
      v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
    }
  }
  return new Blob([ab],{type:'audio/wav'});
}

/* ────────────────────────────────────────────────────────
   RENDER PRINCIPAL
   ──────────────────────────────────────────────────────── */
function renderF11Panel(){
  const panel=document.getElementById('fnPanel');
  const msgs=document.getElementById('msgs');
  const ragBar=document.getElementById('ragBar');
  if(!panel)return;
  if(msgs)msgs.style.display='none';
  if(ragBar)ragBar.style.display='none';
  panel.style.cssText='display:flex;flex-direction:column;padding:0;overflow:hidden;';
  panel.innerHTML=buildF11HTML();
  buildF11Chips();
  updateTransInputBar();
}
function updateTransPanel(){renderF11Panel();}

/* ── HTML principal ── */
function buildF11HTML(){
  const linked=transcripcion.linkedCase;

  const docsSection=`<div class="f11-section">
    <div class="f11-row" style="margin-bottom:8px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12v10H2z"/><path d="M5 3V1.5M11 3V1.5"/></svg>
      <span class="f11-section-title">Documentos de la Función</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <label class="f11-upload-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Subir documentos
        <input type="file" accept=".pdf,.docx,.doc,.txt" style="display:none" onchange="handleTransDocUpload(this)"/>
      </label>
      <label class="f11-upload-btn" style="border-color:var(--gold-dim);color:var(--gold)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        Subir audio / video
        <input type="file" accept="${TRANS_ACCEPT}" style="display:none" onchange="handleTransAudioUpload(this)"/>
      </label>
    </div>
    ${transcripcion.audioFile
      ?`<div class="f11-file-chip">
          🔊 ${esc(transcripcion.audioFile.name)}
          <span style="font-size:10px;opacity:.7;margin-left:4px">(${fmtSize(transcripcion.audioFile.size)})</span>
          <button onclick="transcripcion.audioFile=null;transcripcion.audioUrl=null;renderF11Panel()" class="f11-chip-del">✕</button>
        </div>`
      :''}
    ${transcripcion.baseDocName
      ?`<div class="f11-file-chip">📄 ${esc(transcripcion.baseDocName)} <button onclick="clearTransDoc()" class="f11-chip-del">✕</button></div>`
      :`<div class="f11-empty-docs">Sin documentos cargados para esta función</div>`}
    ${transcripcion.audioUrl?`<audio controls src="${transcripcion.audioUrl}" style="width:100%;margin-top:8px;height:32px"></audio>`:''}
  </div>`;

  const caseSection=`<div class="f11-section f11-case-section" onclick="toggleF11CaseDropdown()">
    <div class="f11-row" style="justify-content:space-between">
      <div class="f11-row" style="gap:7px">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2h12v12H2z"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="9" y2="8"/></svg>
        ${linked
          ?`<span style="color:var(--gold);font-weight:500;font-size:11.5px">📋 ${esc(linked.name)}${linked.rol?' · '+esc(linked.rol):''}</span>`
          :`<span style="font-size:11.5px;color:var(--text-dim)">Vincular con un Caso</span>`}
      </div>
      <span style="font-size:10px;color:var(--text-muted)">${linked?'✓ vinculado':'opcional'}</span>
    </div>
    ${linked?`<button class="btn-sm" style="font-size:9.5px;padding:2px 8px;margin-top:6px" onclick="event.stopPropagation();unlinkF11Case()">Desvincular</button>`:''}
  </div>
  <div id="f11CaseDropdown" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-height:150px;overflow-y:auto;">
    ${(typeof allCases!=='undefined'?allCases:[]).slice(0,20).map(c=>
      `<div class="f11-case-option" onclick="linkF11Case('${c.id}')">
        <span style="font-weight:500;font-size:12px">${esc(c.name)}</span>
        ${c.rol?`<span style="font-size:10px;color:var(--text-muted)"> · ${esc(c.rol)}</span>`:''}
      </div>`
    ).join('')}
  </div>`;

  // ── Result view
  if(transcripcion.step==='result'&&(transcripcion.structuredText||transcripcion.rawText)){
    const text=transcripcion.structuredText||transcripcion.rawText;
    return`<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-result-actions">
        <button class="btn-sm" onclick="copyTranscripcion()">📋 Copiar</button>
        <button class="btn-sm" onclick="downloadTransWord()">⬇ Descargar</button>
        ${!transcripcion.summary?'<button class="btn-sm" onclick="generateTransSummary()">📊 Resumen IA</button>':''}
        <button class="btn-cancel" style="margin-left:auto" onclick="resetTranscripcion()">↺ Nueva</button>
      </div>
      ${transcripcion.transcribeProvider?`<div style="font-size:10px;color:var(--text-muted);text-align:right">Transcrito con: ${esc(transcripcion.transcribeProvider)}</div>`:''}
      ${transcripcion.summary?`<div class="trans-summary-box"><strong style="font-size:11px;color:var(--gold)">📊 Resumen</strong><div style="font-size:12px;margin-top:5px;line-height:1.6">${md(transcripcion.summary)}</div></div>`:''}
      <div class="trans-result-box">${md(text)}</div>
    </div>`;
  }

  // ── Processing
  if(transcripcion.isProcessing){
    const msgs={
      compressing:'Comprimiendo audio para envío (16kHz mono)…',
      transcribing:'Transcribiendo audio… esto puede tomar unos minutos',
      structuring:'Estructurando como acta formal…',
    };
    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-processing">
        <div class="typing" style="justify-content:center"><div class="da"></div><div class="da"></div><div class="da"></div></div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">${msgs[transcripcion.step]||msgs.transcribing}</div>
      </div>
    </div>`;
  }

  // ── After transcription
  if(transcripcion.step==='structure'&&transcripcion.rawText){
    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
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

  // ── Default: upload
  return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
    ${docsSection}${caseSection}
    <div class="f11-fn-card">
      <div class="f11-fn-card-header">
        <span class="f11-fn-badge">F11</span>
        <span class="f11-fn-title">Función F11 – Transcripción de Actas</span>
      </div>
      <div class="f11-fn-desc">
        Transcribe archivos de audio o video de declaraciones a texto estructurado.
        Suba el archivo y opcionalmente un documento base para generar un acta formal.
      </div>
    </div>
    <div class="f11-format-card">
      <div class="f11-format-label">FORMATOS SOPORTADOS</div>
      <div class="f11-format-body">
        <strong>Audio:</strong> MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WMA, AMR, AIFF, CAF, WebM, 3GP<br>
        <strong>Video:</strong> MP4, MOV, AVI, MKV, WMV, FLV, WebM<br>
        <strong>Grabaciones:</strong> iPhone (CAF/M4A), Android (AMR/3GP/OGG), WhatsApp (OPUS/OGG)<br><br>
        <em>El audio se comprime automáticamente a calidad de voz (16kHz) para optimizar el envío.</em>
      </div>
    </div>
    <div class="f11-note">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r=".5" fill="#f59e0b" stroke="none"/></svg>
      La transcripción se realiza mediante IA. Revise siempre el texto resultante para verificar precisión de nombres, fechas y términos técnicos.
    </div>
  </div>`;
}

/* ── Chips de modo ── */
function buildF11Chips(){
  const row=document.getElementById('fnChipsRow');if(!row)return;
  [{id:'solo',label:'+ Solo transcribir'},
   {id:'pregunta_respuesta',label:'+ Formato pregunta-respuesta'},
   {id:'con_expediente',label:'+ Con datos del expediente'}
  ].forEach((m,_,arr)=>{
    row.innerHTML=arr.map(m=>
      `<button class="fn-chip ${transcripcion.selectedMode===m.id?'fn-chip-active':''}"
         onclick="selectF11Mode('${m.id}')">${esc(m.label)}</button>`
    ).join('');
  });
}
function selectF11Mode(mode){
  transcripcion.selectedMode=transcripcion.selectedMode===mode?null:mode;
  buildF11Chips();
  const hint=document.getElementById('fnHint');
  const h={solo:'Solo transcribir',pregunta_respuesta:'Formato pregunta-respuesta',con_expediente:'Con datos del expediente'};
  if(hint)hint.textContent=h[mode]||'Suba audio/video para transcribir';
}

/* ── Input bar ── */
function updateTransInputBar(){
  const hint=document.getElementById('fnHint');
  const ah=document.querySelector('.input-attach-hint');
  if(hint)hint.textContent='Suba audio/video para transcribir. Vincule un expediente para incluir datos en el acta.';
  if(ah)ah.textContent='Audio/Video';
  const fi=document.getElementById('fnDocInput');
  if(fi){
    fi.accept=TRANS_ACCEPT;
    fi.onchange=function(e){
      const file=e.target.files?.[0];if(!file)return;
      if(!isAV(file)){showToast('⚠ Formato no reconocido: .'+ext(file.name));return;}
      if(file.size>TRANS_MAX_INPUT){showToast(`⚠ Archivo muy grande (${fmtSize(file.size)}). Máximo: ${TRANS_MAX_INPUT_MB} MB`);return;}
      transcripcion.audioFile=file;
      transcripcion.audioUrl=URL.createObjectURL(file);
      transcripcion.step='upload';
      renderF11Panel();
      showToast(`✓ ${file.name} (${fmtSize(file.size)})`);
    };
  }
}

/* ── Case dropdown ── */
function toggleF11CaseDropdown(){const dd=document.getElementById('f11CaseDropdown');if(dd)dd.style.display=dd.style.display==='none'?'block':'none';}
function linkF11Case(caseId){const c=(typeof allCases!=='undefined'?allCases:[]).find(x=>x.id===caseId);if(c){transcripcion.linkedCase=c;showToast(`✓ Vinculado: ${c.name}`);}renderF11Panel();}
function unlinkF11Case(){transcripcion.linkedCase=null;renderF11Panel();}

/* ── File uploads ── */
function handleTransAudioUpload(input){
  const file=input.files?.[0];if(!file)return;
  if(!isAV(file)){showToast('⚠ Formato no reconocido. Intente con MP3, WAV, M4A, OGG, MP4, etc.');input.value='';return;}
  if(file.size>TRANS_MAX_INPUT){showToast(`⚠ Archivo muy grande (${fmtSize(file.size)}). Máximo: ${TRANS_MAX_INPUT_MB} MB`);input.value='';return;}
  transcripcion.audioFile=file;
  transcripcion.audioUrl=URL.createObjectURL(file);
  renderF11Panel();
  showToast(`✓ ${file.name} (${fmtSize(file.size)})`);
  input.value='';
}
function handleTransDocUpload(input){
  const file=input.files?.[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{transcripcion.baseDocText=e.target.result||'';transcripcion.baseDocName=file.name;renderF11Panel();showToast(`✓ ${file.name}`);};
  reader.readAsText(file);input.value='';
}
function clearTransDoc(){transcripcion.baseDocText='';transcripcion.baseDocName='';renderF11Panel();}

/* ── Grabación ── */
function startTransRecording(){
  navigator.mediaDevices.getUserMedia({audio:true})
    .then(stream=>{
      transcripcion.audioChunks=[];
      const opts=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
      let selMime='';
      for(const m of opts){if(MediaRecorder.isTypeSupported(m)){selMime=m;break;}}
      const mrOpts=selMime?{mimeType:selMime}:{};
      transcripcion.mediaRecorder=new MediaRecorder(stream,mrOpts);
      transcripcion.mediaRecorder.ondataavailable=e=>transcripcion.audioChunks.push(e.data);
      transcripcion.mediaRecorder.onstop=()=>{
        const actualMime=transcripcion.mediaRecorder.mimeType||'audio/webm';
        const e=actualMime.includes('mp4')?'m4a':actualMime.includes('ogg')?'ogg':'webm';
        const blob=new Blob(transcripcion.audioChunks,{type:actualMime});
        transcripcion.audioFile=new File([blob],`grabacion.${e}`,{type:actualMime});
        transcripcion.audioUrl=URL.createObjectURL(blob);
        transcripcion.isRecording=false;
        stream.getTracks().forEach(t=>t.stop());
        renderF11Panel();showToast('✓ Grabado');
      };
      transcripcion.mediaRecorder.start();transcripcion.isRecording=true;renderF11Panel();
    }).catch(err=>showToast('⚠ Micrófono: '+err.message));
}
function stopTransRecording(){if(transcripcion.mediaRecorder&&transcripcion.isRecording)transcripcion.mediaRecorder.stop();}

/* ════════════════════════════════════════════════════════
   TRANSCRIBIR — Función principal
   1. Comprime audio a 16kHz mono WAV (client-side)
   2. Envía a /transcribe (Whisper → ElevenLabs → Claude)
   3. Fallback: envía a /chat (Claude directo)
   ════════════════════════════════════════════════════════ */
async function transcribeAudio(){
  if(!transcripcion.audioFile){showToast('⚠ Carga un archivo de audio primero');return;}

  const inputBox=document.getElementById('inputBox');
  const extraInstr=inputBox?.value.trim()||'';
  if(inputBox)inputBox.value='';

  transcripcion.isProcessing=true;
  transcripcion.transcribeProvider=null;

  try {
    /* ── Paso 1: Comprimir audio ── */
    transcripcion.step='compressing';renderF11Panel();
    let fileToSend=transcripcion.audioFile;

    try {
      const compressed=await compressForTranscription(transcripcion.audioFile);
      console.log(`Audio comprimido: ${fmtSize(transcripcion.audioFile.size)} → ${fmtSize(compressed.size)}`);
      fileToSend=compressed;
      showToast(`✓ Comprimido: ${fmtSize(compressed.size)}`);
    } catch(compErr){
      console.warn('Compresión falló, usando archivo original:',compErr);
      showToast('⚠ No se pudo comprimir, enviando original…');
    }

    /* ── Paso 2: Verificar tamaño post-compresión ── */
    // base64 añade ~33% de overhead
    const estimatedB64Size=fileToSend.size*1.37;
    if(estimatedB64Size>TRANS_MAX_PAYLOAD){
      throw new Error(`Audio demasiado largo (${fmtSize(fileToSend.size)} comprimido). Intente con un archivo más corto (< 3 min) o corte el audio antes de subirlo.`);
    }

    /* ── Paso 3: Leer como base64 ── */
    transcripcion.step='transcribing';renderF11Panel();
    const b64=await new Promise((res,rej)=>{
      const r=new FileReader();
      r.onload=e=>res(e.target.result.split(',')[1]);
      r.onerror=rej;r.readAsDataURL(fileToSend);
    });

    /* ── Contexto ── */
    const lnk=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const modeCtx=transcripcion.selectedMode==='pregunta_respuesta'
      ?'Formato PREGUNTA-RESPUESTA con roles [FISCAL] y [DECLARANTE]'
      :transcripcion.selectedMode==='con_expediente'
      ?'Incluye datos del expediente en el encabezado'
      :'Transcripción directa';
    const instructions=[modeCtx,lnk?'Expediente: '+lnk.name:'',extraInstr].filter(Boolean).join('. ');

    /* ── Paso 4: Intentar /transcribe ── */
    let transcript=null,provider=null;

    try {
      const resp=await fetch(TRANSCRIBE_EP,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          audioBase64:b64,
          fileName:fileToSend.name,
          mimeType:mimeOf(fileToSend),
          instructions:instructions,
        })
      });
      if(resp.ok){
        const data=await resp.json();
        if(data.transcript){transcript=data.transcript;provider=data.provider||'transcribe';}
        if(data.error){console.warn('Transcribe endpoint error:',data.error,data.details);}
      }
    } catch(epErr){
      console.warn('Endpoint /transcribe no disponible:',epErr);
    }

    /* ── Paso 5: Fallback → Claude /chat ── */
    if(!transcript){
      const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
      const body={
        model:'claude-sonnet-4-20250514',max_tokens:4000,
        system:`Eres Fiscalito. Transcribe el audio fielmente. Identifica hablantes: [FISCAL],[DECLARANTE],[TESTIGO],[ACTUARIO]. Partes inaudibles: [INAUDIBLE]. ${instructions}`,
        messages:[{role:'user',content:[
          {type:'text',text:`Transcribe este audio.${extraInstr?' '+extraInstr:''}`},
          {type:'document',source:{type:'base64',media_type:mimeOf(fileToSend),data:b64}}
        ]}]
      };
      const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
      const data=await resp.json();
      transcript=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
      provider='claude-direct';
    }

    if(!transcript||!transcript.trim())throw new Error('Sin respuesta de transcripción');

    transcripcion.rawText=transcript;
    transcripcion.transcribeProvider=provider;
    transcripcion.step='structure';
    transcripcion.isProcessing=false;
    renderF11Panel();showToast('✓ Transcripción completa');

  } catch(err){
    transcripcion.isProcessing=false;transcripcion.step='upload';
    renderF11Panel();showToast('⚠ '+err.message);
    console.error('Transcripción error:',err);
  }
}

/* ── Estructurar ── */
async function structureTranscripcion(){
  if(!transcripcion.rawText)return;
  transcripcion.step='structuring';transcripcion.isProcessing=true;renderF11Panel();
  try {
    const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
    const lnk=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const body={model:'claude-sonnet-4-20250514',max_tokens:4000,
      system:`Eres Fiscalito. Estructura la transcripción como ACTA FORMAL institucional UMAG. Expediente: ${lnk?.name||'[EXPEDIENTE]'} | ROL: ${lnk?.rol||'[ROL]'} | Fecha: ${new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}. ${transcripcion.baseDocText?'Documento base disponible.':''}`,
      messages:[{role:'user',content:`Estructura como acta formal:\n\n${transcripcion.rawText}`}]};
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.structuredText=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.step='result';transcripcion.isProcessing=false;renderF11Panel();showToast('✓ Acta estructurada');
  } catch(err){transcripcion.isProcessing=false;transcripcion.step='structure';renderF11Panel();showToast('⚠ '+err.message);}
}

/* ── Resumen ── */
async function generateTransSummary(){
  if(!transcripcion.rawText)return;
  transcripcion.isGeneratingSummary=true;renderF11Panel();
  try {
    const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
    const body={model:'claude-sonnet-4-20250514',max_tokens:600,
      system:'Eres Fiscalito. Resumen ejecutivo en 3-5 puntos clave.',
      messages:[{role:'user',content:`Resumen:\n\n${transcripcion.rawText.substring(0,2500)}`}]};
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.summary=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.isGeneratingSummary=false;renderF11Panel();
  } catch(err){transcripcion.isGeneratingSummary=false;renderF11Panel();showToast('⚠ '+err.message);}
}

/* ── Acciones resultado ── */
function copyTranscripcion(){navigator.clipboard.writeText(transcripcion.structuredText||transcripcion.rawText);showToast('✓ Copiado');}
function downloadTransWord(){
  const blob=new Blob([transcripcion.structuredText||transcripcion.rawText],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`acta_${Date.now()}.txt`;a.click();URL.revokeObjectURL(a.href);
}
function resetTranscripcion(){
  if(transcripcion.audioUrl)URL.revokeObjectURL(transcripcion.audioUrl);
  Object.assign(transcripcion,{isRecording:false,audioChunks:[],audioFile:null,audioUrl:null,baseDocText:'',baseDocName:'',rawText:'',structuredText:'',summary:'',segments:[],step:'upload',isProcessing:false,isGeneratingSummary:false,selectedMode:null,transcribeProvider:null});
  renderF11Panel();buildF11Chips();
}
function switchTransView(){renderF11Panel();}

/* ── CSS ── */
(function injectTransCSS(){
  if(document.getElementById('f11-css'))return;
  const s=document.createElement('style');s.id='f11-css';
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
