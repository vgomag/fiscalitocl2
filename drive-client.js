/* Fiscalito — Drive Client v3 */
(function() {
  function installPatches() {
    if (typeof pickCaseById === 'function') {
      var _orig = pickCaseById;
      window.pickCaseById = async function(id) {
        if (id && window._casesMap && window._casesMap[id]) {
          window._currentDriveCase = window._casesMap[id];
        }
        return _orig.apply(this, arguments);
      };
    }
    if (typeof showTab === 'function') {
      var _origShow = showTab;
      window.showTab = function(tab) {
        _origShow.apply(this, arguments);
        if (tab === 'tabDrive') setTimeout(loadDriveTab, 50);
      };
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(installPatches, 200); });
  } else {
    setTimeout(installPatches, 200);
  }
})();

async function callDrive(body) {
  var res = await fetch('/.netlify/functions/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var d = await res.json();
  if (!d.ok) throw new Error(d.error || 'Error en Drive');
  return d;
}

function fmtSize(b) {
  if (!b) return '';
  var n = parseInt(b);
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n/1024).toFixed(0) + 'KB';
  return (n/1048576).toFixed(1) + 'MB';
}

async function loadDriveTab() {
  var caso = window._currentDriveCase;
  var no   = document.getElementById('driveNoFolder');
  var has  = document.getElementById('driveHasFolder');
  var pic  = document.getElementById('drivePicker');
  if (!no || !has || !pic) return;
  if (!caso) {
    no.style.display = 'block'; has.style.display = 'none'; pic.style.display = 'none';
    return;
  }
  if (caso.drive_folder_id) {
    no.style.display = 'none'; has.style.display = 'block'; pic.style.display = 'none';
    var link = document.getElementById('driveFolderLink');
    var name = document.getElementById('driveFolderName');
    if (link) link.href = caso.drive_folder_url || ('https://drive.google.com/drive/folders/' + caso.drive_folder_id);
    if (name) name.textContent = (caso.name || 'Caso') + ' \u2014 Drive';
    await driveRefreshFiles();
  } else {
    no.style.display = 'block'; has.style.display = 'none'; pic.style.display = 'none';
  }
}

async function driveRefreshFiles() {
  var caso = window._currentDriveCase;
  if (!caso || !caso.drive_folder_id) return;
  var el = document.getElementById('driveFilesList');
  if (!el) return;
  el.innerHTML = '<div class="drive-empty">Cargando archivos...</div>';
  try {
    var r = await callDrive({ action: 'files', folderId: caso.drive_folder_id });
    if (!r.files || !r.files.length) { el.innerHTML = '<div class="drive-empty">La carpeta est\u00e1 vac\u00eda.</div>'; return; }
    el.innerHTML = r.files.map(function(f) {
      return '<div class="drive-file-item"><a href="' + f.webViewLink + '" target="_blank">' + f.name + '</a><span class="drive-file-size">' + fmtSize(f.size) + '</span></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="drive-empty" style="color:#c00">' + e.message + '</div>'; }
}

async function driveCreateFolder() {
  var caso = window._currentDriveCase;
  if (!caso) { alert('Selecciona un caso primero.'); return; }
  var name = prompt('Nombre de la carpeta:', caso.rol ? (caso.rol + ' - ' + caso.name) : caso.name);
  if (!name) return;
  try {
    var r = await callDrive({ action: 'createFolder', caseId: caso.id, folderName: name });
    window._currentDriveCase.drive_folder_id = r.folder.id;
    window._currentDriveCase.drive_folder_url = 'https://drive.google.com/drive/folders/' + r.folder.id;
    if (window._casesMap && window._casesMap[caso.id]) {
      window._casesMap[caso.id].drive_folder_id = r.folder.id;
      window._casesMap[caso.id].drive_folder_url = window._currentDriveCase.drive_folder_url;
    }
    await loadDriveTab();
  } catch(e) { alert('Error al crear carpeta: ' + e.message); }
}

async function driveShowPicker() {
  var pic = document.getElementById('drivePicker');
  var list = document.getElementById('drivePickerList');
  if (!pic || !list) return;
  pic.style.display = 'block';
  list.innerHTML = '<div class="drive-empty">Cargando carpetas...</div>';
  try {
    var r = await callDrive({ action: 'list' });
    if (!r.folders || !r.folders.length) { list.innerHTML = '<div class="drive-empty">No hay carpetas.</div>'; return; }
    list.innerHTML = r.folders.map(function(f) {
      return '<div class="drive-folder-option"><span>\ud83d\udcc1 ' + f.name + '</span><button onclick="driveLinkFolder(\'' + f.id + '\',\'' + f.name.replace(/'/g, "\\'") + '\')">Vincular</button></div>';
    }).join('');
  } catch(e) { list.innerHTML = '<div class="drive-empty" style="color:#c00">' + e.message + '</div>'; }
}

async function driveLinkFolder(folderId, folderName) {
  var caso = window._currentDriveCase;
  if (!caso) return;
  try {
    await callDrive({ action: 'link', caseId: caso.id, folderId: folderId, folderName: folderName });
    window._currentDriveCase.drive_folder_id = folderId;
    window._currentDriveCase.drive_folder_url = 'https://drive.google.com/drive/folders/' + folderId;
    if (window._casesMap && window._casesMap[caso.id]) {
      window._casesMap[caso.id].drive_folder_id = folderId;
      window._casesMap[caso.id].drive_folder_url = window._currentDriveCase.drive_folder_url;
    }
    await loadDriveTab();
  } catch(e) { alert('Error al vincular: ' + e.message); }
}

async function driveUnlink() {
  if (!confirm('\u00bfDesvincular carpeta? No la elimina en Drive.')) return;
  var caso = window._currentDriveCase;
  if (!caso) return;
  try {
    await fetch(window.SB_URL + '/rest/v1/cases?id=eq.' + caso.id, {
      method: 'PATCH',
      headers: { apikey: window.SB_KEY, Authorization: 'Bearer ' + window.SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ drive_folder_id: null, drive_folder_url: null })
    });
    window._currentDriveCase.drive_folder_id = null;
    window._currentDriveCase.drive_folder_url = null;
    if (window._casesMap && window._casesMap[caso.id]) {
      window._casesMap[caso.id].drive_folder_id = null;
      window._casesMap[caso.id].drive_folder_url = null;
    }
    await loadDriveTab();
  } catch(e) { alert('Error al desvincular: ' + e.message); }
}
