/* ====================================================================
MOD-LEY21369.JS - Módulo completo Ley 21.369
Implementación Ley sobre Acoso Sexual, Violencia y Discriminación de Género
====================================================================
Versión: 2.0 · Refundido · 2026-03-25
Integración: Fiscalito / UPAG
==================================================================== */

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

const LEY_STATUS = {
  pendiente: { label:'Pendiente', cls:'ley-badge-pendiente' },
  en_proceso: { label:'En proceso', cls:'ley-badge-en_proceso' },
  cumplido: { label:'Cumplido', cls:'ley-badge-cumplido' },
  no_aplica: { label:'No aplica', cls:'ley-badge-no_aplica' }
};

const LEY_REQUISITOS_LEGALES = [
  { 
    art:'Art. 1', 
    titulo:'Objetivo', 
    reqs:[
      { k:'1.1', txt:'Políticas integrales contra acoso sexual, violencia y discriminación de género' },
      { k:'1.2', txt:'Ambiente seguro y libre de acoso para toda la comunidad universitaria' }
    ]
  },
  { 
    art:'Art. 2', 
    titulo:'Protocolo de actuación', 
    reqs:[
      { k:'2.1', txt:'Protocolo aprobado para enfrentar denuncias' },
      { k:'2.2', txt:'Procedimiento claro de recepción y tramitación de denuncias' },
      { k:'2.3', txt:'Procedimiento claro de recepción y tramitación de denuncias' },
      { k:'2.4', txt:'Plazos definidos para cada etapa del procedimiento' },
      { k:'2.5', txt:'Garantías de debido proceso y derecho a defensa' }
    ]
  },
  { 
    art:'Art. 3', 
    titulo:'Modelo de prevención', 
    reqs:[
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
  if (!window.leyState) {
    window.leyState = {
      items: [],
      documents: [],
      leyCases: [],
      tab: 'semaforo'
    };
  }
}

const loadLey21369Cases = async (supabase) => {
  try {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .order('numero_expediente');

    if (error) {
      console.error('Error al cargar casos:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
};

const renderLey21369Tab = () => {
  openLey21369();
  return '<div>Módulo Ley 21.369 cargado correctamente</div>';
};

const switchLeyTab = (tabName) => {
  openLey21369();
  window.leyState.tab = tabName;
};

const toggleLeyArea = (areaId) => {
  const area = LEY_AREAS.find(a => a.id === areaId);
  if (area) {
    console.log('Área expandida:', area.label);
  }
};

export { 
  openLey21369, 
  loadLey21369Cases, 
  renderLey21369Tab,
  switchLeyTab,
  toggleLeyArea,
  LEY_AREAS,
  LEY_STATUS,
  LEY_REQUISITOS_LEGALES
};
