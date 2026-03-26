/**
 * INTEGRACIÓN DE CASOS TERMINADOS
 * Código para incorporar los datos de casos terminados 
 * a tu aplicación FiscalitoClh
 */

// ============================================================================
// 1. Hook para cargar casos terminados desde Supabase
// ============================================================================
// Archivo: src/hooks/useCasosTerminados.js

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Hook para cargar solo casos terminados
 * @returns { casos, loading, error, refresh }
 */
export function useCasosTerminados() {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('casos')
        .select('*')
        .eq('estado', 'TERMINADO')
        .eq('tipo_caso', 'GENERO')
        .order('fecha_denuncia', { ascending: false });

      if (error) throw error;
      setCasos(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return { casos, loading, error, refresh: cargar };
}

// ============================================================================
// 2. Componente para mostrar tabla de casos terminados
// ============================================================================
// Archivo: src/components/TablaCasosTerminados.jsx

import { useCasosTerminados } from '../hooks/useCasosTerminados';
import { formatDate } from '../utils/dates';
import './TablaCasosTerminados.css';

export function TablaCasosTerminados({ onCasoSelect = null }) {
  const { casos, loading, error } = useCasosTerminados();
  const [filtro, setFiltro] = useState('');

  const filtrados = casos.filter(caso =>
    !filtro.trim() ||
    caso.numero_expediente?.toLowerCase().includes(filtro.toLowerCase()) ||
    caso.denunciante?.toLowerCase().includes(filtro.toLowerCase()) ||
    caso.denunciado?.toLowerCase().includes(filtro.toLowerCase()) ||
    caso.materia?.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) return <div className="loading">Cargando casos terminados...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="tabla-casos-terminados">
      <div className="header-tabla">
        <h3>Casos Terminados ({filtrados.length})</h3>
        <input
          type="text"
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="input-busqueda"
        />
      </div>

      <table className="tabla">
        <thead>
          <tr>
            <th>Expediente</th>
            <th>Denunciante</th>
            <th>Denunciado</th>
            <th>Materia</th>
            <th>Fecha Denuncia</th>
            <th>Duración (días)</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((caso) => (
            <tr 
              key={caso.id}
              onClick={() => onCasoSelect && onCasoSelect(caso)}
              style={{ cursor: onCasoSelect ? 'pointer' : 'default' }}
            >
              <td className="bold">{caso.numero_expediente}</td>
              <td>{caso.denunciante}</td>
              <td>{caso.denunciado}</td>
              <td className="materia">{caso.materia}</td>
              <td>{formatDate(caso.fecha_denuncia)}</td>
              <td className="texto-centro">{caso.duracion_dias || '—'}</td>
              <td>
                <span className={`badge badge-${caso.resultado?.toLowerCase().replace(' ', '-')}`}>
                  {caso.resultado}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// 3. Componente de estadísticas de casos terminados
// ============================================================================
// Archivo: src/components/EstadisticasTerminados.jsx

import { useCasosTerminados } from '../hooks/useCasosTerminados';

export function EstadisticasTerminados() {
  const { casos } = useCasosTerminados();

  // Cálculos
  const totalCasos = casos.length;
  const duraciones = casos
    .filter(c => c.duracion_dias)
    .map(c => c.duracion_dias);
  const duracionPromedio = duraciones.length 
    ? Math.round(duraciones.reduce((a, b) => a + b) / duraciones.length)
    : 0;

  // Materias más comunes
  const materias = {};
  casos.forEach(c => {
    materias[c.materia] = (materias[c.materia] || 0) + 1;
  });
  const materiasTop = Object.entries(materias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Resultados
  const resultados = {};
  casos.forEach(c => {
    resultados[c.resultado] = (resultados[c.resultado] || 0) + 1;
  });

  return (
    <div className="estadisticas-terminados">
      <h3>📊 Estadísticas Casos Terminados</h3>

      <div className="grid-2">
        <div className="card">
          <h4>Total de Casos</h4>
          <p className="numero">{totalCasos}</p>
        </div>

        <div className="card">
          <h4>Duración Promedio</h4>
          <p className="numero">{duracionPromedio} días</p>
        </div>
      </div>

      <div className="card">
        <h4>Resultados</h4>
        <ul className="lista-stats">
          {Object.entries(resultados).map(([resultado, count]) => (
            <li key={resultado}>
              {resultado}: <strong>{count}</strong> ({Math.round(count/totalCasos*100)}%)
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h4>Top Materias</h4>
        <ul className="lista-stats">
          {materiasTop.map(([materia, count]) => (
            <li key={materia}>
              {materia}: <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// 4. Integración en página MisCasos (ACTUALIZAR EXISTENTE)
// ============================================================================
// Archivo: src/pages/MisCasos.jsx
// AÑADE ESTO A TU COMPONENTE EXISTENTE:

import { TablaCasosTerminados } from '../components/TablaCasosTerminados';
import { EstadisticasTerminados } from '../components/EstadisticasTerminados';

export function MisCasos() {
  const [casoSeleccionado, setCasoSeleccionado] = useState(null);
  const [vista, setVista] = useState('todos'); // 'todos', 'terminados'

  return (
    <div className="mis-casos">
      <h1>Mis Casos</h1>

      {/* TABS */}
      <div className="tabs">
        <button 
          className={vista === 'todos' ? 'active' : ''} 
          onClick={() => setVista('todos')}
        >
          Todos los Casos
        </button>
        <button 
          className={vista === 'terminados' ? 'active' : ''} 
          onClick={() => setVista('terminados')}
        >
          ✅ Casos Terminados
        </button>
      </div>

      {vista === 'todos' ? (
        /* TU COMPONENTE EXISTENTE DE TODOS LOS CASOS */
        <>
          {/* Tu código actual aquí */}
        </>
      ) : (
        /* VISTA DE CASOS TERMINADOS */
        <div className="vista-terminados">
          <div className="contenedor-principal">
            <div className="lista-contenedor">
              <TablaCasosTerminados onCasoSelect={setCasoSeleccionado} />
            </div>
            <div className="detalle-contenedor">
              {casoSeleccionado ? (
                <DetalleCaso caso={casoSeleccionado} />
              ) : (
                <div className="vacio">
                  Selecciona un caso para ver detalles
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ESTADÍSTICAS SIEMPRE VISIBLES */}
      <div className="seccion-estadisticas">
        <EstadisticasTerminados />
      </div>
    </div>
  );
}

// ============================================================================
// 5. CSS para tablas y estadísticas
// ============================================================================
// Archivo: src/components/TablaCasosTerminados.css

.tabla-casos-terminados {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-tabla {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.header-tabla h3 {
  margin: 0;
  color: #1f2937;
  font-size: 1.125rem;
}

.input-busqueda {
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.875rem;
  min-width: 250px;
}

.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.tabla thead {
  background: #f3f4f6;
  border-bottom: 2px solid #e5e7eb;
}

.tabla th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: #374151;
}

.tabla tbody tr {
  border-bottom: 1px solid #e5e7eb;
  transition: background-color 0.2s;
}

.tabla tbody tr:hover {
  background-color: #f9fafb;
}

.tabla td {
  padding: 1rem;
}

.tabla .bold {
  font-weight: 600;
  color: #1f2937;
}

.tabla .materia {
  color: #6b7280;
  font-size: 0.8rem;
}

.tabla .texto-centro {
  text-align: center;
  font-weight: 500;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-sanción {
  background-color: #fed7aa;
  color: #92400e;
}

.badge-sobreseimiento {
  background-color: #dbeafe;
  color: #0c4a6e;
}

/* Estadísticas */
.estadisticas-terminados {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-top: 2rem;
}

.estadisticas-terminados h3 {
  margin: 0 0 1.5rem 0;
  color: #1f2937;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.card {
  background: #f9fafb;
  padding: 1.5rem;
  border-radius: 6px;
  border-left: 4px solid #3b82f6;
}

.card h4 {
  margin: 0 0 0.5rem 0;
  color: #6b7280;
  font-size: 0.875rem;
  text-transform: uppercase;
}

.card .numero {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: #1f2937;
}

.lista-stats {
  list-style: none;
  padding: 0;
  margin: 0;
}

.lista-stats li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
}

.lista-stats li:last-child {
  border-bottom: none;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
}

.tabs button {
  background: none;
  border: none;
  padding: 1rem 1.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.tabs button:hover {
  color: #1f2937;
}

.tabs button.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

// ============================================================================
// 6. CONSULTAS SQL PARA ESTADÍSTICAS
// ============================================================================
// Copia estas consultas en Supabase SQL Editor

-- Duración promedio de casos terminados
SELECT
  COUNT(*) as total_terminados,
  ROUND(AVG(duracion_dias)::numeric, 2) as duracion_promedio,
  MIN(duracion_dias) as min_dias,
  MAX(duracion_dias) as max_dias
FROM casos
WHERE estado = 'TERMINADO' AND tipo_caso = 'GENERO' AND duracion_dias IS NOT NULL;

-- Resultados más comunes
SELECT
  resultado,
  COUNT(*) as cantidad,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM casos WHERE estado = 'TERMINADO' AND tipo_caso = 'GENERO')::numeric, 2) as porcentaje
FROM casos
WHERE estado = 'TERMINADO' AND tipo_caso = 'GENERO'
GROUP BY resultado
ORDER BY cantidad DESC;

-- Materias en casos terminados
SELECT
  materia,
  COUNT(*) as cantidad,
  ROUND(AVG(duracion_dias)::numeric, 2) as duracion_promedio,
  resultado,
  COUNT(*) FILTER (WHERE resultado = 'Sanción') as sanciones,
  COUNT(*) FILTER (WHERE resultado = 'Sobreseimiento') as sobreseimientos
FROM casos
WHERE estado = 'TERMINADO' AND tipo_caso = 'GENERO'
GROUP BY materia, resultado
ORDER BY cantidad DESC;

// ============================================================================
// 7. ACTUALIZACIÓN EN SUPABASE
// ============================================================================
// 1. Descarga el archivo: update_casos_terminados.sql
// 2. En Supabase: SQL Editor
// 3. Pega TODO el contenido
// 4. Presiona RUN
// 5. Verificar que todos los casos se actualizaron

// ============================================================================
// RESUMEN DE PASOS DE IMPLEMENTACIÓN
// ============================================================================

/*
1. CREAR ARCHIVOS REACT:
   ✅ src/hooks/useCasosTerminados.js (copiar código hook)
   ✅ src/components/TablaCasosTerminados.jsx
   ✅ src/components/TablaCasosTerminados.css
   ✅ src/components/EstadisticasTerminados.jsx

2. ACTUALIZAR TU PÁGINA EXISTENTE:
   ✅ src/pages/MisCasos.jsx (agregar tabs para casos terminados)
   ✅ src/pages/MisCasos.css (agregar estilos de tabs)

3. EN SUPABASE:
   ✅ Ejecutar SQL: update_casos_terminados.sql
   ✅ Crear índice si no existe

4. PROBAR:
   ✅ npm start
   ✅ Ir a MisCasos
   ✅ Click en tab "Casos Terminados"
   ✅ Verificar que aparecen todos los casos

5. (OPCIONAL) ESTADÍSTICAS:
   ✅ Ejecutar consultas SQL para verificar datos
   ✅ Ver componente EstadisticasTerminados
*/
