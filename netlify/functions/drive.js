// netlify/functions/drive.js v2 — soporte recursivo y listSub

const FOLDER_MIS_CASOS = '135lX5Ns5I-yJlEO9Zt10ksPweWeWGw5U';

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function getAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now()/1000);
  const header  = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now+3600
  }));
  const sigInput = `${header}.${payload}`;
  const keyData  = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/,'')
    .replace(/-----END PRIVATE KEY-----/,'')
    .replace(/\n/g,'');
  const binaryKey = Buffer.from(keyData,'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'},
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, Buffer.from(sigInput));
  const jwt = `${sigInput}.${Buffer.from(new Uint8Array(sig)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:jwt})
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth error: '+JSON.stringify(data));
  return data.access_token;
}

async function driveList(q, token, fields='files(id,name,webViewLink,mimeType,createdTime,modifiedTime,size)') {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&orderBy=name&pageSize=200`;
  const res = await fetch(url, {headers:{Authorization:`Bearer ${token}`}});
  if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.files || [];
}

async function listFolders(parentId, token) {
  return driveList(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, token);
}

async function listFiles(parentId, token) {
  return driveList(`'${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`, token);
}

async function drivePost(path, body, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return res.json();
}

// Supabase helpers
function sbH() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  return {apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json'};
}
async function sbGet(path) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {headers:sbH()});
  return res.json();
}
async function sbPatch(id, body) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/cases?id=eq.${id}`, {
    method:'PATCH', headers:{...sbH(), Prefer:'return=minimal'}, body:JSON.stringify(body)
  });
  return res.ok;
}

// Normalizar string para comparación
function norm(s) {
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
}

// Score de match entre nombre de carpeta y caso
function matchScore(folderName, caso) {
  const fn = norm(folderName);
  const rol   = norm(caso.rol||'');
  const name  = norm(caso.name||'');
  const cara  = norm(caso.caratula||'');
  // Extraer número del ROL (ej: "56" de "56G" o "08-2023")
  const rolNum = (caso.rol||'').replace(/[^0-9\-]/g,'').split('-')[0];
  if (rolNum && fn.includes(rolNum) && rolNum.length >= 2) return 95;
  if (rol && rol.length > 1 && fn.includes(rol)) return 90;
  if (name && name.length > 3 && fn.includes(name.substring(0,6))) return 80;
  if (cara && cara.length > 5 && fn.includes(cara.substring(0,8))) return 70;
  return 0;
}

const HEADERS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type,Authorization',
  'Content-Type':'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return {statusCode:200,headers:HEADERS,body:''};
  try {
    const body   = JSON.parse(event.body||'{}');
    const action = body.action;
    const token  = await getAccessToken();

    // ── list: listar carpetas del nivel superior de Mis Casos ──
    if (action==='list') {
      const folders = await listFolders(body.parentId || FOLDER_MIS_CASOS, token);
      return {statusCode:200, headers:HEADERS, body:JSON.stringify({ok:true, folders})};
    }

    // ── files: listar archivos de una carpeta de caso ──
    if (action==='files') {
      if (!body.folderId) throw new Error('folderId requerido');
      const files = await listFiles(body.folderId, token);
      return {statusCode:200, headers:HEADERS, body:JSON.stringify({ok:true, files})};
    }

    // ── link: vincular carpeta a caso ──
    if (action==='link') {
      if (!body.caseId||!body.folderId) throw new Error('caseId y folderId requeridos');
      await sbPatch(body.caseId, {
        drive_folder_id: body.folderId,
        drive_folder_url: `https://drive.google.com/drive/folders/${body.folderId}`
      });
      return {statusCode:200, headers:HEADERS, body:JSON.stringify({ok:true})};
    }

    // ── createFolder: crear carpeta nueva ──
    if (action==='createFolder') {
      if (!body.caseId||!body.folderName) throw new Error('caseId y folderName requeridos');
      const folder = await drivePost('files', {
        name: body.folderName,
        mimeType:'application/vnd.google-apps.folder',
        parents:[FOLDER_MIS_CASOS]
      }, token);
      await sbPatch(body.caseId, {
        drive_folder_id: folder.id,
        drive_folder_url: `https://drive.google.com/drive/folders/${folder.id}`
      });
      return {statusCode:200, headers:HEADERS, body:JSON.stringify({ok:true, folder})};
    }

    // ── sync: vincular automáticamente subcarpetas a casos ──
    if (action==='sync') {
      // 1. Obtener todos los casos de Supabase
      const cases = await sbGet('cases?select=id,name,rol,caratula,drive_folder_id&deleted_at=is.null&limit=500');

      // 2. Obtener carpetas de primer nivel de Mis Casos
      const topFolders = await listFolders(FOLDER_MIS_CASOS, token);

      // 3. Obtener subcarpetas de cada carpeta de primer nivel
      const allFolders = [];
      for (const tf of topFolders) {
        const subs = await listFolders(tf.id, token);
        if (subs.length > 0) {
          // Tiene subcarpetas — usarlas como carpetas de casos
          allFolders.push(...subs);
        } else {
          // No tiene subcarpetas — la carpeta misma es del caso
          allFolders.push(tf);
        }
      }

      // 4. Hacer matching
      const results = {linked:[], skipped:[], unmatched:[]};
      const linkedCaseIds = new Set();

      for (const folder of allFolders) {
        let best = null, bestScore = 0;
        for (const caso of cases) {
          if (caso.drive_folder_id || linkedCaseIds.has(caso.id)) continue;
          const score = matchScore(folder.name, caso);
          if (score > bestScore) { bestScore = score; best = caso; }
        }
        if (best && bestScore >= 70) {
          await sbPatch(best.id, {
            drive_folder_id: folder.id,
            drive_folder_url: `https://drive.google.com/drive/folders/${folder.id}`
          });
          linkedCaseIds.add(best.id);
          results.linked.push({folder:folder.name, case:best.name, rol:best.rol, score:bestScore});
        } else {
          results.unmatched.push(folder.name);
        }
      }

      // 5. Casos sin vincular
      for (const caso of cases) {
        if (!caso.drive_folder_id && !linkedCaseIds.has(caso.id)) {
          results.skipped.push(caso.name);
        }
      }

      return {statusCode:200, headers:HEADERS, body:JSON.stringify({ok:true, results})};
    }

    return {statusCode:400, headers:HEADERS, body:JSON.stringify({error:`Acción desconocida: ${action}`})};
  } catch(err) {
    console.error('drive.js error:', err);
    return {statusCode:500, headers:HEADERS, body:JSON.stringify({error:err.message})};
  }
};
