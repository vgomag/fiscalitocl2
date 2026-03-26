/* ====================================================================
MOD-LEY21369.JS - Módulo completo Ley 21.369
Implementación Ley sobre Acoso Sexual, Violencia y
Discriminación de Género en Instituciones de Educación Superior
====================================================================
Versión: 2.0 · Refundido · 2026-03-25
Integración: Fiscalito / UPAG
==================================================================== */

/* ________________________
   CONSTANTES
   ________________________ */

const LEY_AREAS = [
  { id:'protocolo', label:'Protocolo de actuación', icon:'📋' },
  { id:'modelo_prevencion', label:'Modelo de prevención', icon:'🛡️' },
  { id:'capacitacion', label:'Capacitación y formación', icon:'📚' },
  { id:'difusion', label:'Difusión y sensibilización', icon:'📢' },
  { id:'canales_denuncia', label:'Canales de denuncia', icon:'🔔' },
  { id:'investigacion', label:'Procedimientos de Investigación', icon:'🔍' },
  { id:'medidas_reparacion', label:'Medidas de reparación', icon:'✋' },
  { id:'registro_estadistico', label:'Registro estadístico', icon:'📊' },
  { id:'organo_encargado', label:'Órgano encargado', icon:'👥' },
  { id:'general', label:'General / Otros', icon:'📌' }
];

const LEY_STATUS = [
  { pendiente: { label:'Pendiente', cls:'ley-badge-pendiente' } },
  { en_proceso: { label:'En proceso', cls:'ley-badge-en_proceso' } },
  { cumplido: { label:'Cumplido', cls:'ley-badge-cumplido' } },
  { no_aplica: { label:'No aplica', cls:'ley-badge-no_aplica' } }
];

// Requisitos normativos por artículo para el tab Cumplimiento
const LEY_REQUISITOS_LEGALES = [
  { art:'Art. 1', titulo:'Objetivo', reqs:[
      { k:'1.1', txt:'Políticas integrales contra acoso sexual, violencia y discriminación de género' },
      { k:'1.2', txt:'Ambiente seguro y libre de acoso para toda la comunidad universitaria' }
    ]
  },
  { art:'Art. 2', titulo:'Protocolo de actuación', reqs:[
      { k:'2.1', txt:'Protocolo aprobado para enfrentar denuncias' },
      { k:'2.2', txt:'Procedimiento claro de recepción y tramitación de denuncias' },
      { k:'2.3', txt:'Procedimiento claro de recepción y tramitación de denuncias' },
      { k:'2.4', txt:'Plazos definidos para cada etapa del procedimiento' },
      { k:'2.5', txt:'Garantías de debido proceso y derecho a defensa' }
    ]
  },
  { art:'Art. 3', titulo:'Modelo de prevención', reqs:[
      { k:'3.1', txt:'Política institucional de prevención aprobada' },
      { k:'3.2', txt:'Diagnóstico institucional sobre la materia realizado' },
      { k:'3.3', txt:'Plan de acción con medidas preventivas específicas' }
    ]
  }
];

const LEY_KEYWORDS = [
  'acoso sexual', 'violencia de género', 'violencia de genero', 'discriminación de género',
  'ley 21.369', 'ley 21369', 'protocolo de género', 'protocolo de genero'
];

function openLey21369() {
  const k = 'ley21369';
  if (!window.leyState) window.leyState = {
    items: [],
    documents: [],
    leyCases: [],
    tab: 'semaforo | checklist | cumplimiento | table | alertas | casos | chat | informe
  };
};

const loadLey21369Cases = async () => {
  try {
    setLoading(true);
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error al cargar casos:', error);
      return;
    }

    const casos = data || [];
    setCasos(casos);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};

const renderLey21369KPIs = () => {
  const casesCumlimiento = [];
  const caseStatus = {
    pendiente: 0, en_proceso: 0, cumplido: 0, no_aplica: 0
  };

  const set = (casoSeleccionado) => {
    const { drive_folder_id } = casoSeleccionado;
    if (!folderID) {
      const [data] = await sb.from('cases')
        .select('value')
        .eq('case_id', currentCase.id)
        .eq('key', 'drive_folder_id')
        .limit(2000);
      const items = data || [];
      const cases = casesCumlimiento || [];
    }
  };

  return (
    <div className="rendimientos-ley-grid">
      <div className="renderLey21369KPIs">Ley 21.369 KPIs Panel</div>
    </div>
  );
};

/* ________________________
 * TAB: SEMÁFORO
 * ________________________ */

const renderLeySemaforo = () => {
  return (
    <div className="rendimientos-ley-semaforo">
      <h3>🚦 Semáforo de Cumplimiento - Ley 21.369</h3>
      <p>Estado visual del cumplimiento de requisitos por institución.</p>
    </div>
  );
};

/* ________________________
 * TAB: CHECKLIST
 * ________________________ */

const renderLeyChecklist = () => {
  return (
    <div className="rendimientos-ley-checklist">
      <h3>✅ Checklist de Cumplimiento</h3>
      <p>Lista de verificación de requisitos por artículo.</p>
    </div>
  );
};

/* ________________________
 * TAB: CUMPLIMIENTO
 * ________________________ */

const renderLeyCumplimiento = () => {
  return (
    <div className="rendimientos-ley-cumplimiento">
      <h3>📋 Matriz de Cumplimiento - Ley 21.369</h3>
      <p>Análisis detallado de cumplimiento por requisito legal.</p>
    </div>
  );
};

/* ________________________
 * TAB: TABLA DE CASOS
 * ________________________ */

const renderLeyTabla = () => {
  return (
    <div className="rendimientos-ley-tabla">
      <h3>📊 Tabla de Casos - Ley 21.369</h3>
      <p>Vista tabular de todos los casos reportados.</p>
    </div>
  );
};

/* ________________________
 * TAB: ALERTAS
 * ________________________ */

const renderLeyAlertas = () => {
  return (
    <div className="rendimientos-ley-alertas">
      <h3>⚠️ Alertas y Notificaciones</h3>
      <p>Estado de alertas por incumplimiento.</p>
    </div>
  );
};

/* ________________________
 * TAB: ANÁLISIS DE CASOS
 * ________________________ */

const ley21369ShowMigracionWa = () => {
  return (
    <div>
      <p>Herramienta de migración de casos desde WhatsApp.</p>
    </div>
  );
};

const renderLey21369Tab = () => {
  if (!window.leyState) openLey21369();
  const activeTab = window.leyState.tab || 'semaforo';

  switch(activeTab) {
    case 'semaforo': return renderLeySemaforo();
    case 'checklist': return renderLeyChecklist();
    case 'cumplimiento': return renderLeyCumplimiento();
    case 'table': return renderLeyTabla();
    case 'alertas': return renderLeyAlertas();
    case 'casos': return ley21369ShowMigracionWa();
    default: return <div>Pestaña no encontrada</div>;
  }
};

const set = (prop, val) => {
  if (!window.leyState) openLey21369();
  window.leyState[prop] = val;
};

const switchLeyTab = (tabName) => {
  if (!window.leyState) openLey21369();
  window.leyState.tab = tabName;
};

const toggleLeyArea = (areaId) => {
  const area = LEY_AREAS.find(a => a.id === areaId);
  if (area) {
    console.log(`Expandiendo: ${area.label}`);
  }
};

export { 
  openLey21369, 
  loadLey21369Cases, 
  renderLey21369KPIs, 
  renderLey21369Tab,
  switchLeyTab,
  toggleLeyArea,
  LEY_AREAS,
  LEY_STATUS,
  LEY_REQUISITOS_LEGALES
};
