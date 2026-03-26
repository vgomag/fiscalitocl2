import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MisCasos() {
  const [casosTerminados, setCasosTerminados] = useState([]);
  const [casosActivos, setCasosActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [casoSeleccionado, setCasoSeleccionado] = useState(null);

  useEffect(() => {
    cargarCasos();
  }, []);

  const cargarCasos = async () => {
    try {
      setLoading(true);

      // Cargar casos terminados
      const { data: terminados } = await supabase
        .from('casos')
        .select(`
          id,
          numero_expediente,
          tipo_caso,
          estado,
          materia,
          procedimiento,
          protocolo,
          resultado,
          fecha_denuncia,
          fecha_resolucion,
          fecha_entrega_vista,
          duracion_dias,
          origen,
          año,
          denunciantes,
          estamentos_denunciante,
          denunciados,
          estamentos_denunciado,
          google_drive_url
        `)
        .eq('estado', 'TERMINADO')
        .order('numero_expediente');

      // Cargar casos activos
      const { data: activos } = await supabase
        .from('casos')
        .select(`
          id,
          numero_expediente,
          tipo_caso,
          estado,
          materia,
          procedimiento,
          protocolo,
          fecha_denuncia,
          fecha_resolucion,
          duracion_dias,
          origen,
          judicializada,
          medida_cautelar,
          cual_medida,
          denunciantes,
          estamentos_denunciante,
          denunciados,
          estamentos_denunciado,
          google_drive_url
        `)
        .eq('estado', 'ACTIVO')
        .order('numero_expediente');

      setCasosTerminados(terminados || []);
      setCasosActivos(activos || []);
    } catch (error) {
      console.error('Error al cargar casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtrarCasos = (casos) => {
    return casos.filter((caso) => {
      const coincideBusqueda = 
        caso.numero_expediente.toLowerCase().includes(busqueda.toLowerCase()) ||
        (caso.materia && caso.materia.toLowerCase().includes(busqueda.toLowerCase()));
      
      if (filtro === 'genero') return coincideBusqueda && caso.tipo_caso === 'GENERO';
      if (filtro === 'no-genero') return coincideBusqueda && caso.tipo_caso === 'NO_GENERO';
      return coincideBusqueda;
    });
  };

  const abrirDrive = (url) => {
    if (url) window.open(url, '_blank');
  };

  const DetallesCaso = ({ caso }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">{caso.numero_expediente}</h2>
          <button
            onClick={() => setCasoSeleccionado(null)}
            className="text-2xl font-bold hover:text-blue-200"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Estado y Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Estado</p>
              <p className="text-lg font-bold text-blue-600">{caso.estado}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Tipo</p>
              <p className="text-lg font-bold text-purple-600">{caso.tipo_caso}</p>
            </div>
          </div>

          {/* Materia y Procedimiento */}
          <div className="border-l-4 border-yellow-500 pl-4">
            <p className="text-sm text-gray-600">Materia</p>
            <p className="text-lg font-semibold text-gray-900">{caso.materia || 'N/A'}</p>
          </div>

          <div className="border-l-4 border-green-500 pl-4">
            <p className="text-sm text-gray-600">Procedimiento</p>
            <p className="text-lg font-semibold text-gray-900">{caso.procedimiento || 'N/A'}</p>
          </div>

          {/* Protocolo y Origen */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border-l-4 border-indigo-500 pl-4">
              <p className="text-sm text-gray-600">Protocolo</p>
              <p className="text-lg font-semibold text-gray-900">{caso.protocolo || 'N/A'}</p>
            </div>
            <div className="border-l-4 border-pink-500 pl-4">
              <p className="text-sm text-gray-600">Origen</p>
              <p className="text-lg font-semibold text-gray-900">{caso.origen || 'N/A'}</p>
            </div>
          </div>

          {/* Fechas */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">📅 Fechas</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Denuncia:</span>
                <p className="font-semibold">{caso.fecha_denuncia || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-600">Resolución:</span>
                <p className="font-semibold">{caso.fecha_resolucion || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Duración */}
          {caso.duracion_dias !== null && (
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
              <p className="text-sm text-gray-600">⏱️ Duración del Procedimiento</p>
              <p className="text-2xl font-bold text-green-600">{caso.duracion_dias} días</p>
            </div>
          )}

          {/* Resultado (para terminados) */}
          {caso.resultado && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Resultado</p>
              <p className="text-lg font-semibold text-blue-600">{caso.resultado}</p>
            </div>
          )}

          {/* Medidas Cautelares (para activos) */}
          {caso.medida_cautelar && (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Medida Cautelar</p>
              <p className="text-lg font-semibold text-red-600">{caso.medida_cautelar}</p>
              {caso.cual_medida && (
                <p className="text-sm text-gray-700 mt-1">Especificación: {caso.cual_medida}</p>
              )}
            </div>
          )}

          {/* Denunciantes */}
          {caso.denunciantes && (
            <div className="border-l-4 border-orange-500 pl-4">
              <p className="text-sm text-gray-600 mb-2">👤 Denunciantes</p>
              {Array.isArray(JSON.parse(caso.denunciantes)) ? (
                <ul className="space-y-1">
                  {JSON.parse(caso.denunciantes).map((d, i) => (
                    <li key={i} className="text-sm font-semibold text-gray-900">• {d}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-700">{caso.denunciantes}</p>
              )}
            </div>
          )}

          {/* Estamentos Denunciantes */}
          {caso.estamentos_denunciante && (
            <div className="bg-orange-50 p-3 rounded-lg text-sm">
              <p className="text-gray-600 mb-1">Estamento Denunciante</p>
              <p className="font-semibold text-gray-900">{
                Array.isArray(JSON.parse(caso.estamentos_denunciante)) 
                  ? JSON.parse(caso.estamentos_denunciante).join(', ')
                  : caso.estamentos_denunciante
              }</p>
            </div>
          )}

          {/* Denunciados */}
          {caso.denunciados && (
            <div className="border-l-4 border-red-500 pl-4">
              <p className="text-sm text-gray-600 mb-2">🎯 Denunciados</p>
              {Array.isArray(JSON.parse(caso.denunciados)) ? (
                <ul className="space-y-1">
                  {JSON.parse(caso.denunciados).map((d, i) => (
                    <li key={i} className="text-sm font-semibold text-gray-900">• {d}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-700">{caso.denunciados}</p>
              )}
            </div>
          )}

          {/* Estamentos Denunciados */}
          {caso.estamentos_denunciado && (
            <div className="bg-red-50 p-3 rounded-lg text-sm">
              <p className="text-gray-600 mb-1">Estamento Denunciado</p>
              <p className="font-semibold text-gray-900">{
                Array.isArray(JSON.parse(caso.estamentos_denunciado)) 
                  ? JSON.parse(caso.estamentos_denunciado).join(', ')
                  : caso.estamentos_denunciado
              }</p>
            </div>
          )}

          {/* Google Drive */}
          {caso.google_drive_url && (
            <button
              onClick={() => abrirDrive(caso.google_drive_url)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              📁 Abrir Carpeta en Google Drive
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando casos...</p>
        </div>
      </div>
    );
  }

  const todosCasos = [...casosTerminados, ...casosActivos];
  const casosTerminadosFiltrados = filtrarCasos(casosTerminados);
  const casosActivosFiltrados = filtrarCasos(casosActivos);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📋 Mis Casos</h1>
          <p className="text-gray-600">
            Total: <span className="font-bold text-blue-600">{todosCasos.length} casos</span>
            {' '} | Terminados: <span className="font-bold text-green-600">{casosTerminados.length}</span>
            {' '} | Activos: <span className="font-bold text-blue-600">{casosActivos.length}</span>
          </p>
        </div>

        {/* Filtros y búsqueda */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Búsqueda */}
            <input
              type="text"
              placeholder="Buscar por expediente o materia..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Filtro */}
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todos los casos</option>
              <option value="genero">Solo Género</option>
              <option value="no-genero">Solo No-Género</option>
            </select>
          </div>
        </div>

        {/* CASOS ACTIVOS */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
            Casos Activos ({casosActivosFiltrados.length})
          </h2>
          <div className="grid gap-4">
            {casosActivosFiltrados.length > 0 ? (
              casosActivosFiltrados.map((caso) => (
                <div
                  key={caso.id}
                  onClick={() => setCasoSeleccionado(caso)}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer p-6 border-l-4 border-blue-500 hover:bg-blue-50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{caso.numero_expediente}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">{caso.materia || 'N/A'}</span>
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {caso.tipo_caso}
                        </span>
                        {caso.judicializada === 'Si' && (
                          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                            ⚖️ Judicializada
                          </span>
                        )}
                        {caso.duracion_dias && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            ⏱️ {caso.duracion_dias} días
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirDrive(caso.google_drive_url);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        caso.google_drive_url
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-300 text-gray-500 cursor-default'
                      }`}
                    >
                      📁 Drive
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8 bg-white rounded-lg">
                No hay casos activos con los filtros aplicados
              </p>
            )}
          </div>
        </div>

        {/* CASOS TERMINADOS */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            Casos Terminados ({casosTerminadosFiltrados.length})
          </h2>
          <div className="grid gap-4">
            {casosTerminadosFiltrados.length > 0 ? (
              casosTerminadosFiltrados.map((caso) => (
                <div
                  key={caso.id}
                  onClick={() => setCasoSeleccionado(caso)}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer p-6 border-l-4 border-green-500 opacity-90 hover:opacity-100 hover:bg-green-50"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{caso.numero_expediente}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">{caso.materia || 'N/A'}</span>
                        {caso.resultado && ` • ${caso.resultado}`}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                          {caso.tipo_caso}
                        </span>
                        {caso.duracion_dias && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                            ⏱️ {caso.duracion_dias} días
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirDrive(caso.google_drive_url);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        caso.google_drive_url
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-300 text-gray-500 cursor-default'
                      }`}
                    >
                      📁 Drive
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8 bg-white rounded-lg">
                No hay casos terminados con los filtros aplicados
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalles */}
      {casoSeleccionado && <DetallesCaso caso={casoSeleccionado} />}
    </div>
  );
}
