/* =========================================================
   MOD-PENDIENTES.JS — Vista Pendientes por Caso v3.0
   Fiscalito · 2026-03-25
   ========================================================= */

const pend = {
  acciones: [], cases: {}, loading: false,
  catTab: 'all', statusTab: 'all',
  search: '', caseFilter: 'all',
  viewMode: 'lista',
  collapsed: new Set(),
};

/* ── Open ── */
function openPendientes() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (typeof event !== 'undefined') event?.currentTarget?.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewPendientes');
  loadPendientesData();
}

/* ── Load data ── */
async function loadPendientesData() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  pend.loading = true;
  renderPendientesView();
  try {
    const [accsRes, casesRes] = await Promise.all([
      sb.from('acciones_pendientes')
        .select('id,case_id,title,description,status,priority,due_date,created_at,completed_at')
        .order('due_date', { ascending: true, nullsFirst: false }),
      sb.from('cases')
        .select('id,name,rol,caratula,categoria,status,tipo_procedimiento,materia,protocolo')
        .is('deleted_at', null),
    ]);
    pend.acciones = accsRes.data || [];
    pend.cases = {};
    (casesRes.data || []).forEach(c => { pend.cases[c.id] = c; });
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    pend.loading = false;
    renderPendientesView();
  }
}

/* ── Helpers ── */
function pendFiltered() {
  let list = pend.acciones;
  if (pend.catTab !== 'all') {
    list = list.filter(a => {
      const cat = pend.cases[a.case_id]?.categoria;
      if (pend.catTab === 'terminado') return pend.cases[a.case_id]?.status === 'terminado';
      return cat === pend.catTab;
    });
  }
  if (pend.statusTab !== 'all') list = list.filter(a => a.status === pend.statusTab);
  if (pend.caseFilter !== 'all') list = list.filter(a => a.case_id === pend.caseFilter);
  if (pend.search.trim()) {
    const q = pend.search.toLowerCase();
    list = list.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (pend.cases[a.case_id]?.name || '').toLowerCase().includes(q) ||
      (pend.cases[a.case_id]?.rol || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function pendCatCount(cat) {
  if (cat === 'all') return pend.acciones.length;
  if (cat === 'terminado') return pend.acciones.filter(a => pend.cases[a.case_id]?.status === 'terminado').length;
  return pend.acciones.filter(a => pend.cases[a.case_id]?.categoria === cat).length;
}

function pendStatusCount(status, catList) {
  const base = catList || pend.acciones;
  if (status === 'all') return base.length;
  return base.filter(a => a.status === status).length;
}

function pendFormatDate(d) {
  if (!d) return '';
  try {
    return new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return d; }
}

function pendIsOverdue(a) {
  if (!a.due_date || a.status === 'completado') return false;
  return new Date(a.due_date) < new Date();
}

/* ── Main render ── */
function renderPendientesView() {
  const main = document.getElementById('pendMain');
  if (!main) return;

  if (pend.loading) {
    main.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
      <div class="typing" style="justify-content:center;margin-bottom:10px"><div class="da"></div><div class="da"></div><div class="da"></div></div>
      Cargando pendientes…
    </div>`;
    return;
  }

  const filtered = pendFiltered();
  const casesWithItems = new Set(filtered.map(a => a.case_id)).size;

  const cats = [
    { id: 'all',        icon: '📋', label: 'Todos' },
    { id: 'genero',     icon: '👥', label: 'Género' },
    { id: 'no_genero',  icon: '📂', label: 'No Género' },
    { id: 'cargos',     icon: '⚖️',  label: 'Cargos' },
    { id: 'finalizacion', icon: '✅', label: 'Finalización' },
  ];

  // Cat-scoped list for status counts
  let catScoped = pend.acciones;
  if (pend.catTab !== 'all') {
    catScoped = pend.acciones.filter(a => {
      if (pend.catTab === 'terminado') return pend.cases[a.case_id]?.status === 'terminado';
      return pend.cases[a.case_id]?.categoria === pend.catTab;
    });
  }

  main.innerHTML = `
  <div class="pv-wrap">
    <!-- TOP BAR -->
    <div class="pv-topbar">
      <div>
        <div class="pv-title">Pendientes por Caso</div>
        <div class="pv-subtitle">Organiza las próximas acciones de todos tus casos</div>
      </div>
      <div class="pv-topbar-actions">
        <button class="btn-sm pv-ia-btn" onclick="pendAnalyzarIA()">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 8.5L7 10l3.5-4"/></svg>
          Analizar con IA
        </button>
        <button class="btn-save pv-new-btn" onclick="showPendNueva()">+ Nueva acción</button>
      </div>
    </div>

    <!-- CAT TABS -->
    <div class="pv-cat-tabs">
      ${cats.map(cat => `
        <button class="pv-cat-tab ${pend.catTab === cat.id ? 'active' : ''}"
          onclick="pend.catTab='${cat.id}';pend.statusTab='all';updatePendContent()">
          ${cat.icon} ${cat.label}
          <span class="pv-count-chip">${pendCatCount(cat.id)}</span>
        </button>`).join('')}
    </div>

    <!-- STATUS TABS + TOOLBAR -->
    <div class="pv-toolbar">
      <div class="pv-status-tabs">
        ${[['all','Todos'],['pendiente','Pendientes'],['en_progreso','En progreso'],['completado','Completadas']].map(([s, l]) => `
          <button class="pv-status-tab ${pend.statusTab === s ? 'active' : ''} pv-st-${s}"
            onclick="pend.statusTab='${s}';updatePendContent()">
            ${l} (${pendStatusCount(s, catScoped)})
          </button>`).join('')}
      </div>
      <div class="pv-toolbar-right">
        <div class="pv-search-box">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
          <input id="pendSearch" class="pv-search-input" placeholder="Buscar…" value="${esc(pend.search)}"
            oninput="pend.search=this.value;updatePendContent()"/>
        </div>
        <select class="pv-select" onchange="pend.caseFilter=this.value;updatePendContent()">
          <option value="all">Todos los casos</option>
          ${Object.values(pend.cases)
            .filter(c => pend.acciones.some(a => a.case_id === c.id))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(c => `<option value="${c.id}" ${pend.caseFilter === c.id ? 'selected' : ''}>${esc(c.name || '—')}</option>`)
            .join('')}
        </select>
        <div class="pv-view-toggle">
          <button class="pv-view-btn ${pend.viewMode === 'lista' ? 'active' : ''}" onclick="pend.viewMode='lista';updatePendContent()">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="11" x2="9" y2="11"/></svg>
            Lista
          </button>
          <button class="pv-view-btn ${pend.viewMode === 'kanban' ? 'active' : ''}" onclick="pend.viewMode='kanban';updatePendContent()">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1.5" y="2" width="4" height="12" rx="1"/><rect x="6.5" y="2" width="4" height="9" rx="1"/><rect x="11.5" y="2" width="3" height="7" rx="1"/></svg>
            Kanban
          </button>
        </div>
      </div>
    </div>

    <!-- META ROW -->
    <div class="pv-meta-row">
      <span>Mostrando ${filtered.length} de ${pend.acciones.length} acciones en ${casesWithItems} casos</span>
      <button class="pv-collapse-btn" onclick="pendToggleAll()">
        ${pend.collapsed.size > 0 ? 'Expandir todos' : 'Colapsar todos'}
      </button>
    </div>

    <!-- CONTENT -->
    <div class="pv-content" id="pendContent">
      ${pend.viewMode === 'lista' ? renderPendLista(filtered) : renderPendKanban(filtered)}
    </div>
  </div>

  <!-- NUEVA ACCIÓN MODAL -->
  <div id="pendNuevaModal" style="display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.35)" onclick="if(event.target===this)closePendNueva()">
    <div class="mini-modal" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">
      <div class="mini-modal-title">+ Nueva acción pendiente</div>
      <div class="mini-field"><label>Caso *</label>
        <select id="pendNewCase">
          <option value="">— Seleccionar expediente —</option>
          ${Object.values(pend.cases).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c =>
            `<option value="${c.id}">${esc(c.name || '—')}${c.rol ? ' · ' + esc(c.rol) : ''}</option>`
          ).join('')}
        </select>
      </div>
      <div class="mini-field"><label>Título *</label>
        <input id="pendNewTitle" placeholder="Ej: Citar a denunciante - Res. 60/2026"/>
      </div>
      <div class="mini-field"><label>Descripción</label>
        <textarea id="pendNewDesc" rows="2" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;resize:vertical;" placeholder="Descripción opcional…"></textarea>
      </div>
      <div class="mini-row">
        <div class="mini-field"><label>Prioridad</label>
          <select id="pendNewPriority"><option value="alta">🔴 Urgente</option><option value="normal" selected>🟡 Normal</option><option value="baja">⚪ Baja</option></select>
        </div>
        <div class="mini-field"><label>Fecha límite</label>
          <input type="date" id="pendNewDate"/>
        </div>
      </div>
      <div class="mini-modal-actions">
        <button class="btn-cancel" onclick="closePendNueva()">Cancelar</button>
        <button class="btn-save" onclick="savePendNueva()">Guardar acción</button>
      </div>
    </div>
  </div>`;
}

/* ── Lista view ── */
function renderPendLista(filtered) {
  if (!filtered.length) return `<div class="pv-empty">Sin acciones que coincidan con los filtros.</div>`;

  const byCase = {};
  filtered.forEach(a => {
    if (!byCase[a.case_id]) byCase[a.case_id] = [];
    byCase[a.case_id].push(a);
  });

  // Sort cases: urgent first
  const caseEntries = Object.entries(byCase).sort(([, aList], [, bList]) => {
    const aUrgent = aList.some(a => a.priority === 'alta' || a.priority === 'urgente') ? 0 : 1;
    const bUrgent = bList.some(b => b.priority === 'alta' || b.priority === 'urgente') ? 0 : 1;
    return aUrgent - bUrgent;
  });

  return caseEntries.map(([caseId, acciones]) => {
    const c = pend.cases[caseId] || {};
    const isCollapsed = pend.collapsed.has(caseId);
    const urgCount = acciones.filter(a => a.priority === 'alta' || a.priority === 'urgente').length;
    const overdueCount = acciones.filter(a => pendIsOverdue(a)).length;

    return `
    <div class="pv-group">
      <div class="pv-group-header" onclick="pendToggleCase('${caseId}')">
        <div class="pv-group-left">
          <svg class="pv-chevron ${isCollapsed ? '' : 'open'}" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,4 6,8 10,4"/></svg>
          <span class="pv-case-name">${esc(c.name || '—')}</span>
          ${c.rol ? `<span class="pv-case-rol">${esc(c.rol)}</span>` : ''}
          ${c.categoria ? `<span class="pv-case-cat pv-cat-${c.categoria}">${c.categoria === 'genero' ? 'G' : c.categoria === 'no_genero' ? 'NG' : c.categoria === 'cargos' ? 'C' : 'F'}</span>` : ''}
        </div>
        <div class="pv-group-right">
          ${overdueCount > 0 ? `<span class="pv-overdue-chip">⚠ ${overdueCount} vencida${overdueCount > 1 ? 's' : ''}</span>` : ''}
          ${urgCount > 0 ? `<span class="pv-urgent-chip">${urgCount} urgente${urgCount > 1 ? 's' : ''}</span>` : ''}
          <span class="pv-total-chip">${acciones.length} acción${acciones.length !== 1 ? 'es' : ''}</span>
          <button class="pv-case-open-btn" onclick="event.stopPropagation();pickCaseById&&pickCaseById('${caseId}')" title="Abrir caso">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M13 1h2v2M9.5 6.5l5-5"/></svg>
          </button>
        </div>
      </div>
      <div class="pv-group-body" style="${isCollapsed ? 'display:none' : ''}">
        ${acciones.map(a => renderPendRow(a)).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderPendRow(a) {
  const isDone = a.status === 'completado';
  const isInProg = a.status === 'en_progreso';
  const overdue = pendIsOverdue(a);
  const isUrgent = a.priority === 'alta' || a.priority === 'urgente';

  return `
  <div class="pv-row ${isDone ? 'pv-row-done' : ''}" onclick="openPendDetail('${a.id}')">
    <input type="checkbox" class="pv-check" ${isDone ? 'checked' : ''}
      onclick="event.stopPropagation()" onchange="pendToggleDone('${a.id}', this.checked)"/>
    <span class="pv-dot" style="background:${isUrgent ? '#ef4444' : isInProg ? '#4f46e5' : '#9ca3af'}"></span>
    <div class="pv-row-body">
      <div class="pv-row-title ${isDone ? 'pv-done-text' : ''} ${overdue ? 'pv-overdue-text' : ''}">${esc(a.title || '—')}</div>
      ${a.due_date ? `<div class="pv-row-date ${overdue ? 'pv-overdue-text' : ''}">📅 ${pendFormatDate(a.due_date)}${overdue ? ' · Vencida' : ''}</div>` : ''}
    </div>
    ${isInProg ? `<span class="pv-status-pill pv-pill-prog">En progreso</span>` : isDone ? `<span class="pv-status-pill pv-pill-done">Completada</span>` : `<span class="pv-status-pill pv-pill-pend">Pendiente</span>`}
    <svg class="pv-row-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,4 10,8 6,12"/></svg>
  </div>`;
}

/* ── Kanban view ── */
function renderPendKanban(filtered) {
  const cols = [
    { id: 'pendiente',   label: 'Pendientes',   color: '#f59e0b', bg: 'rgba(245,158,11,.08)' },
    { id: 'en_progreso', label: 'En progreso',  color: '#4f46e5', bg: 'rgba(79,70,229,.07)' },
    { id: 'completado',  label: 'Completadas',  color: '#059669', bg: 'rgba(5,150,105,.08)' },
  ];
  return `<div class="pv-kanban">
    ${cols.map(col => {
      const items = filtered.filter(a => a.status === col.id);
      return `<div class="pv-kanban-col">
        <div class="pv-kanban-header" style="border-top:3px solid ${col.color}">
          <span style="font-weight:600;font-size:12px">${col.label}</span>
          <span class="pv-total-chip">${items.length}</span>
        </div>
        <div class="pv-kanban-cards">
          ${items.length === 0
            ? `<div class="pv-empty-small">Sin acciones</div>`
            : items.map(a => {
                const c = pend.cases[a.case_id] || {};
                const overdue = pendIsOverdue(a);
                const isUrgent = a.priority === 'alta' || a.priority === 'urgente';
                return `<div class="pv-kanban-card ${overdue ? 'pv-kanban-card-overdue' : ''}" onclick="openPendDetail('${a.id}')">
                  <div class="pv-kanban-card-title">${esc(a.title || '—')}</div>
                  <div class="pv-kanban-card-case">
                    <span style="color:${isUrgent ? '#ef4444' : '#9ca3af'}">●</span>
                    ${esc(c.name || '—')}${c.rol ? ' · ' + esc(c.rol) : ''}
                  </div>
                  ${a.due_date ? `<div class="pv-kanban-card-date ${overdue ? 'pv-overdue-text' : ''}">📅 ${pendFormatDate(a.due_date)}</div>` : ''}
                </div>`;
              }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Detail modal ── */
function openPendDetail(id) {
  const a = pend.acciones.find(x => x.id === id);
  if (!a) return;
  const c = pend.cases[a.case_id] || {};
  const overdue = pendIsOverdue(a);
  const isUrgent = a.priority === 'alta' || a.priority === 'urgente';

  const statusOptions = [
    ['pendiente', 'Pendiente'],
    ['en_progreso', 'En progreso'],
    ['completado', 'Completada'],
  ];

  document.getElementById('miniModalTitle').textContent = 'Detalle de acción';
  document.getElementById('miniModalBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:12px 14px">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.4">${esc(a.title || '—')}</div>
        <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>📋 ${esc(c.name || '—')}</span>
          ${c.rol ? `<span>· ${esc(c.rol)}</span>` : ''}
          ${c.categoria ? `<span class="pv-case-cat pv-cat-${c.categoria}" style="margin-left:4px">${c.categoria}</span>` : ''}
        </div>
      </div>
      ${a.description ? `<div style="font-size:12.5px;color:var(--text-dim);line-height:1.65;padding:4px 0">${esc(a.description)}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
        <div>
          <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Estado</div>
          <select onchange="updatePendStatus('${a.id}',this.value);closeMiniModal()"
            style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 9px;border-radius:var(--radius);font-size:12px;font-family:var(--font-body,'Inter',sans-serif);outline:none;width:100%">
            ${statusOptions.map(([s, l]) => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div>
          <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Prioridad</div>
          <div style="color:${isUrgent ? '#ef4444' : '#9ca3af'};font-weight:500;padding:5px 0">${isUrgent ? '🔴 Urgente' : '🟡 Normal'}</div>
        </div>
        ${a.due_date ? `<div>
          <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Fecha límite</div>
          <div style="color:${overdue ? 'var(--red)' : 'var(--text-dim)'};font-size:12.5px">${pendFormatDate(a.due_date)}${overdue ? ' ⚠ Vencida' : ''}</div>
        </div>` : ''}
        ${a.completed_at ? `<div>
          <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Completada</div>
          <div style="color:var(--green);font-size:12.5px">${pendFormatDate(a.completed_at)}</div>
        </div>` : ''}
      </div>
      <div style="display:flex;gap:8px;padding-top:4px">
        <button class="btn-save" style="flex:1;padding:7px" onclick="updatePendStatus('${a.id}','completado')">✓ Marcar completada</button>
        <button class="btn-sm" onclick="if(typeof pickCaseById!=='undefined')pickCaseById('${a.case_id}');closeMiniModal()">Abrir caso</button>
        <button class="btn-del" onclick="deletePendAccion('${a.id}')">🗑</button>
      </div>
    </div>`;

  document.getElementById('miniModalSaveBtn').style.display = 'none';
  window._miniModalSave = null;
  openMiniModal();
}

/* ── CRUD ── */
async function pendToggleDone(id, done) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const status = done ? 'completado' : 'pendiente';
  const { error } = await sb.from('acciones_pendientes').update({
    status, completed_at: done ? new Date().toISOString() : null
  }).eq('id', id);
  if (error) { showToast('⚠ ' + error.message); return; }
  const a = pend.acciones.find(x => x.id === id);
  if (a) { a.status = status; a.completed_at = done ? new Date().toISOString() : null; }
  updatePendContent();
  showToast(done ? '✓ Completada' : '↺ Reabierta');
}

async function updatePendStatus(id, newStatus) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { error } = await sb.from('acciones_pendientes').update({
    status: newStatus, completed_at: newStatus === 'completado' ? new Date().toISOString() : null
  }).eq('id', id);
  if (error) { showToast('⚠ ' + error.message); return; }
  const a = pend.acciones.find(x => x.id === id);
  if (a) a.status = newStatus;
  updatePendContent();
  showToast('✓ Estado actualizado');
}

async function deletePendAccion(id) {
  if (!confirm('¿Eliminar esta acción?')) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  await sb.from('acciones_pendientes').delete().eq('id', id);
  pend.acciones = pend.acciones.filter(a => a.id !== id);
  closeMiniModal();
  updatePendContent();
  showToast('✓ Eliminada');
}

function showPendNueva() {
  const m = document.getElementById('pendNuevaModal');
  if (m) m.style.display = 'flex';
}
function closePendNueva() {
  const m = document.getElementById('pendNuevaModal');
  if (m) m.style.display = 'none';
}

async function savePendNueva() {
  const caseId = document.getElementById('pendNewCase')?.value;
  const title = document.getElementById('pendNewTitle')?.value.trim();
  const desc = document.getElementById('pendNewDesc')?.value.trim();
  const priority = document.getElementById('pendNewPriority')?.value || 'normal';
  const dueDate = document.getElementById('pendNewDate')?.value;
  if (!caseId) { showToast('⚠ Selecciona un expediente'); return; }
  if (!title) { showToast('⚠ El título es obligatorio'); return; }
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb.from('acciones_pendientes').insert({
    case_id: caseId, user_id: user.id, title,
    description: desc || null, priority, status: 'pendiente',
    due_date: dueDate || null,
  }).select('*').single();
  if (error) { showToast('⚠ ' + error.message); return; }
  pend.acciones.unshift(data);
  closePendNueva();
  updatePendContent();
  showToast('✓ Acción creada');
}

/* ── UI helpers ── */
function pendToggleCase(caseId) {
  if (pend.collapsed.has(caseId)) pend.collapsed.delete(caseId);
  else pend.collapsed.add(caseId);
  const body = document.querySelector(`[id="pcase-body-${caseId}"]`) ||
    document.querySelector(`#pcase-${caseId} .pv-group-body`);
  const chev = document.querySelector(`#pcase-${caseId} .pv-chevron`);

  // Find group and toggle
  const allGroups = document.querySelectorAll('.pv-group');
  allGroups.forEach(g => {
    const header = g.querySelector('.pv-group-header');
    if (header?.getAttribute('onclick')?.includes(caseId)) {
      const body2 = g.querySelector('.pv-group-body');
      const chev2 = g.querySelector('.pv-chevron');
      if (body2) body2.style.display = pend.collapsed.has(caseId) ? 'none' : '';
      if (chev2) chev2.classList.toggle('open', !pend.collapsed.has(caseId));
    }
  });
}

function pendToggleAll() {
  const filtered = pendFiltered();
  const caseIds = [...new Set(filtered.map(a => a.case_id))];
  const allCollapsed = pend.collapsed.size >= caseIds.length;
  if (allCollapsed) pend.collapsed.clear();
  else caseIds.forEach(id => pend.collapsed.add(id));
  updatePendContent();
}

function updatePendContent() {
  const filtered = pendFiltered();
  const casesWithItems = new Set(filtered.map(a => a.case_id)).size;

  // Update content area
  const content = document.getElementById('pendContent');
  if (content) content.innerHTML = pend.viewMode === 'lista' ? renderPendLista(filtered) : renderPendKanban(filtered);

  // Update meta row
  const meta = document.querySelector('.pv-meta-row span');
  if (meta) meta.textContent = `Mostrando ${filtered.length} de ${pend.acciones.length} acciones en ${casesWithItems} casos`;

  // Update cat tab counts
  document.querySelectorAll('.pv-cat-tab').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    const m = onclick.match(/pend\.catTab='([^']+)'/);
    if (!m) return;
    const catId = m[1];
    btn.classList.toggle('active', pend.catTab === catId);
    const chip = btn.querySelector('.pv-count-chip');
    if (chip) chip.textContent = pendCatCount(catId);
  });

  // Update status tabs
  let catScoped = pend.acciones;
  if (pend.catTab !== 'all') {
    catScoped = pend.acciones.filter(a => {
      if (pend.catTab === 'terminado') return pend.cases[a.case_id]?.status === 'terminado';
      return pend.cases[a.case_id]?.categoria === pend.catTab;
    });
  }
  document.querySelectorAll('.pv-status-tab').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    const m = onclick.match(/pend\.statusTab='([^']+)'/);
    if (!m) return;
    const s = m[1];
    btn.classList.toggle('active', pend.statusTab === s);
    const labels = { all: 'Todos', pendiente: 'Pendientes', en_progreso: 'En progreso', completado: 'Completadas' };
    btn.textContent = `${labels[s]} (${pendStatusCount(s, catScoped)})`;
  });
}

function pendAnalyzarIA() {
  const filtered = pendFiltered().filter(a => a.status !== 'completado');
  if (!filtered.length) { showToast('Sin acciones pendientes para analizar'); return; }
  const grouped = {};
  filtered.forEach(a => {
    const c = pend.cases[a.case_id];
    if (!grouped[a.case_id]) grouped[a.case_id] = { case: c, acciones: [] };
    grouped[a.case_id].acciones.push(a);
  });
  const ctx = Object.values(grouped).map(g =>
    `CASO: ${g.case?.name || '—'} (${g.case?.tipo_procedimiento || '—'})\n${g.acciones.map(a =>
      `  - ${a.title}${a.due_date ? ' [' + pendFormatDate(a.due_date) + ']' : ''}${(a.priority === 'alta' || a.priority === 'urgente') ? ' ⚠URGENTE' : ''}`
    ).join('\n')}`
  ).join('\n\n');
  if (typeof showView === 'function') showView('viewCase');
  if (typeof showTab === 'function') showTab('tabChat');
  setTimeout(() => {
    const inp = document.getElementById('inputBox');
    if (inp) inp.value = `Analiza estas acciones pendientes y recomienda priorización y plazos críticos:\n\n${ctx}`;
  }, 300);
  showToast('✓ Enviando al Chat IA');
}

/* ── Inject view ── */
(function injectPendView() {
  if (document.getElementById('viewPendientes')) return;
  const view = document.createElement('div');
  view.id = 'viewPendientes';
  view.className = 'view';
  view.style.cssText = 'display:none;flex-direction:column;overflow:hidden;';
  view.innerHTML = `<div id="pendMain" style="flex:1;overflow-y:auto;background:var(--bg)"><div style="padding:40px;text-align:center;color:var(--text-muted)">Cargando…</div></div>`;
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();

/* ── CSS ── */
(function injectPendCSS() {
  const old = document.getElementById('pend-css');
  if (old) old.remove();
  const s = document.createElement('style');
  s.id = 'pend-css';
  s.textContent = `
/* wrap */
.pv-wrap{display:flex;flex-direction:column;min-height:100%;}
/* topbar */
.pv-topbar{display:flex;align-items:center;justify-content:space-between;padding:13px 18px 10px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pv-title{font-family:var(--font-serif,'EB Garamond',serif);font-size:20px;font-weight:400;}
.pv-subtitle{font-size:11px;color:var(--text-muted);margin-top:1px;}
.pv-topbar-actions{display:flex;gap:8px;align-items:center;}
.pv-ia-btn{display:flex;align-items:center;gap:5px;font-size:11.5px;padding:6px 12px;}
.pv-new-btn{padding:7px 15px;font-size:12px;}
/* cat tabs */
.pv-cat-tabs{display:flex;background:var(--surface);border-bottom:1px solid var(--border);padding:0 14px;flex-shrink:0;overflow-x:auto;gap:0;}
.pv-cat-tab{display:inline-flex;align-items:center;gap:5px;padding:8px 12px;font-size:12px;font-weight:500;color:var(--text-muted);border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;font-family:var(--font-body,'Inter',sans-serif);transition:all .12s;}
.pv-cat-tab:hover{color:var(--text);}
.pv-cat-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:600;}
.pv-count-chip{font-size:10px;padding:1px 6px;border-radius:9px;background:var(--surface2);border:1px solid var(--border);color:var(--text-muted);}
.pv-cat-tab.active .pv-count-chip{background:rgba(79,70,229,.1);border-color:rgba(79,70,229,.2);color:var(--gold);}
/* toolbar */
.pv-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pv-status-tabs{display:flex;gap:5px;flex-wrap:wrap;}
.pv-status-tab{padding:4px 11px;font-size:11.5px;border-radius:18px;border:1px solid var(--border2);background:none;color:var(--text-muted);cursor:pointer;font-family:var(--font-body,'Inter',sans-serif);font-weight:500;transition:all .1s;}
.pv-status-tab:hover{color:var(--text);}
.pv-status-tab.active,.pv-st-all.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);}
.pv-st-pendiente.active{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3);color:#d97706;}
.pv-st-en_progreso.active{background:rgba(79,70,229,.08);border-color:rgba(79,70,229,.3);color:var(--gold);}
.pv-st-completado.active{background:rgba(5,150,105,.08);border-color:rgba(5,150,105,.3);color:#059669;}
.pv-toolbar-right{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;}
.pv-search-box{display:flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);padding:5px 10px;min-width:160px;}
.pv-search-input{border:none;background:none;outline:none;font-size:12px;font-family:var(--font-body,'Inter',sans-serif);color:var(--text);width:100%;}
.pv-search-input::placeholder{color:var(--text-muted);}
.pv-select{background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:5px 9px;border-radius:var(--radius);font-size:12px;font-family:var(--font-body,'Inter',sans-serif);outline:none;max-width:180px;}
.pv-view-toggle{display:flex;border:1px solid var(--border2);border-radius:var(--radius);overflow:hidden;}
.pv-view-btn{display:flex;align-items:center;gap:5px;padding:5px 11px;font-size:11.5px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.pv-view-btn.active{background:var(--gold-glow);color:var(--gold);}
/* meta row */
.pv-meta-row{display:flex;align-items:center;justify-content:space-between;padding:5px 16px;font-size:11px;color:var(--text-muted);background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pv-collapse-btn{background:none;border:none;cursor:pointer;font-size:11px;color:var(--gold);font-family:var(--font-body,'Inter',sans-serif);padding:2px 6px;}
.pv-collapse-btn:hover{background:var(--gold-glow);border-radius:4px;}
/* content */
.pv-content{padding:10px 14px;display:flex;flex-direction:column;gap:6px;}
.pv-empty{padding:48px;text-align:center;color:var(--text-muted);font-size:13px;}
/* case group — KEY FIX: no overflow:hidden, no fixed height */
.pv-group{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 1px 2px rgba(0,0,0,.04);}
.pv-group-header{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;cursor:pointer;user-select:none;transition:background .1s;}
.pv-group-header:hover{background:var(--surface2);}
.pv-group-left{display:flex;align-items:center;gap:7px;flex:1;min-width:0;}
.pv-group-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.pv-chevron{flex-shrink:0;transition:transform .18s;transform:rotate(0deg);color:var(--text-muted);}
.pv-chevron.open{transform:rotate(0deg);}
.pv-chevron:not(.open){transform:rotate(-90deg);}
.pv-case-name{font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pv-case-rol{font-size:10.5px;color:var(--text-muted);font-family:var(--font-mono,'DM Mono',monospace);flex-shrink:0;}
.pv-case-cat{font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:4px;flex-shrink:0;}
.pv-cat-genero{background:rgba(236,72,153,.1);color:#db2777;}
.pv-cat-no_genero{background:rgba(245,158,11,.1);color:#d97706;}
.pv-cat-cargos{background:rgba(79,70,229,.1);color:var(--gold);}
.pv-cat-finalizacion{background:rgba(5,150,105,.1);color:#059669;}
.pv-overdue-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;}
.pv-urgent-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;}
.pv-total-chip{font-size:10px;padding:1px 7px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--text-muted);}
.pv-case-open-btn{background:none;border:none;cursor:pointer;color:var(--text-muted);padding:3px 5px;border-radius:4px;transition:all .1s;display:flex;align-items:center;}
.pv-case-open-btn:hover{color:var(--gold);background:var(--gold-glow);}
/* group body — KEY: no overflow hidden */
.pv-group-body{border-top:1px solid var(--border);}
/* action row */
.pv-row{display:flex;align-items:center;gap:9px;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;}
.pv-row:last-child{border-bottom:none;}
.pv-row:hover{background:var(--surface2);}
.pv-row-done{opacity:.55;}
.pv-check{width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0;}
.pv-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.pv-row-body{flex:1;min-width:0;}
.pv-row-title{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pv-done-text{text-decoration:line-through;color:var(--text-muted);}
.pv-overdue-text{color:#ef4444;}
.pv-row-date{font-size:10.5px;color:var(--text-muted);margin-top:1px;font-family:var(--font-mono,'DM Mono',monospace);}
.pv-status-pill{font-size:10px;font-weight:500;padding:2px 8px;border-radius:9px;white-space:nowrap;flex-shrink:0;}
.pv-pill-pend{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;}
.pv-pill-prog{background:rgba(79,70,229,.07);border:1px solid rgba(79,70,229,.2);color:var(--gold);}
.pv-pill-done{background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.25);color:#059669;}
.pv-row-arrow{color:var(--text-muted);flex-shrink:0;}
/* kanban */
.pv-kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 0;}
.pv-kanban-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);}
.pv-kanban-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface2);}
.pv-kanban-cards{padding:8px;display:flex;flex-direction:column;gap:6px;max-height:500px;overflow-y:auto;}
.pv-kanban-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;cursor:pointer;transition:all .12s;}
.pv-kanban-card:hover{box-shadow:0 2px 6px rgba(0,0,0,.07);transform:translateY(-1px);}
.pv-kanban-card-overdue{border-left:3px solid #ef4444;}
.pv-kanban-card-title{font-size:12px;font-weight:500;margin-bottom:5px;line-height:1.4;}
.pv-kanban-card-case{font-size:10.5px;color:var(--text-muted);display:flex;align-items:center;gap:5px;margin-bottom:3px;}
.pv-kanban-card-date{font-size:10px;font-family:var(--font-mono,'DM Mono',monospace);}
.pv-empty-small{font-size:11px;color:var(--text-muted);text-align:center;padding:16px;}
`;
  document.head.appendChild(s);
})();
