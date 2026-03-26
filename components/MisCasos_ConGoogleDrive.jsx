import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MisCasos() {
  const [casosTerminados, setCasosTerminados] = useState([]);
  const [casosActivos, setCasosActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [urlTemp, setUrlTemp] = useState('');

  useEffect(() => {
    cargarCasos();
  }, []);

  const cargarCasos = async () => {
    try {
      setLoading(true);

      // Cargar casos terminados
      const { data: terminados } = await supabase
        .from('casos')
        .select('id, numero_expediente, materia, resultado, google_drive_url')
        .eq('estado', 'TERMINADO')
        .order('numero_expediente');

      // Cargar casos activos
      const { data: activos } = await supabase
        .from('casos')
        .select('id, numero_expediente, materia, estado, google_drive_url')
        .eq('estado', 'ACTIVO')
        .order('numero_expediente');

      setCasosTerminados(terminados || []);
      setCasosActivos(activos || []);
    } catch (error) {
      console.error('Error al cargar casos:', error);
      alert('Error al cargar casos');
    } finally {
      setLoading(false);
    }
  };

  const abrirDrive = (url) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  const iniciarEdicion = (caso) => {
    setEditando(caso.id);
    setUrlTemp(caso.google_drive_url || '');
  };

  const guardarUrl = async (casoId) => {
    try {
      const { error } = await supabase
        .from('casos')
        .update({ google_drive_url: urlTemp || null })
        .eq('id', casoId);

      if (error) throw error;

      // Actualizar estado local
      setCasosTerminados(
        casosTerminados.map((c) =>
          c.id === casoId ? { ...c, google_drive_url: urlTemp } : c
        )
      );
      setCasosActivos(
        casosActivos.map((c) =>
          c.id === casoId ? { ...c, google_drive_url: urlTemp } : c
        )
      );

      setEditando(null);
      setUrlTemp('');
    } catch (error) {
      console.error('Error al guardar URL:', error);
      alert('Error al guardar URL');
    }
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setUrlTemp('');
  };

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

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">📋 Mis Casos</h1>
        <p className="text-gray-600 mb-8">Gestiona tus casos y accede a los documentos en Google Drive</p>

        {/* CASOS ACTIVOS */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <h2 className="text-2xl font-bold text-gray-900">
              Casos Activos ({casosActivos.length})
            </h2>
          </div>

          {casosActivos.length > 0 ? (
            <div className="grid gap-4">
              {casosActivos.map((caso) => (
                <div
                  key={caso.id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition p-6 border-l-4 border-blue-500"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Info del caso */}
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {caso.numero_expediente}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Materia: <span className="font-medium">{caso.materia || 'N/A'}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Estado: <span className="font-medium text-blue-600">{caso.estado}</span>
                      </p>
                    </div>

                    {/* Google Drive */}
                    <div>
                      {editando === caso.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={urlTemp}
                            onChange={(e) => setUrlTemp(e.target.value)}
                            placeholder="Pega el URL de Google Drive"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => guardarUrl(caso.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition"
                            >
                              ✓ Guardar
                            </button>
                            <button
                              onClick={cancelarEdicion}
                              className="flex-1 bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition"
                            >
                              ✕ Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {caso.google_drive_url ? (
                            <button
                              onClick={() => abrirDrive(caso.google_drive_url)}
                              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                              </svg>
                              Abrir en Drive
                            </button>
                          ) : (
                            <button
                              onClick={() => iniciarEdicion(caso)}
                              className="inline-flex items-center gap-2 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm transition"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                              </svg>
                              Agregar Link
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editar */}
                    {editando !== caso.id && caso.google_drive_url && (
                      <div className="text-right">
                        <button
                          onClick={() => iniciarEdicion(caso)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-12 bg-white rounded-lg">
              No hay casos activos
            </p>
          )}
        </div>

        {/* CASOS TERMINADOS */}
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <h2 className="text-2xl font-bold text-gray-900">
              Casos Terminados ({casosTerminados.length})
            </h2>
          </div>

          {casosTerminados.length > 0 ? (
            <div className="grid gap-4">
              {casosTerminados.map((caso) => (
                <div
                  key={caso.id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition p-6 border-l-4 border-green-500 opacity-90 hover:opacity-100"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    {/* Info del caso */}
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {caso.numero_expediente}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Materia: <span className="font-medium">{caso.materia || 'N/A'}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Resultado: <span className="font-medium text-green-600">{caso.resultado || 'N/A'}</span>
                      </p>
                    </div>

                    {/* Google Drive */}
                    <div>
                      {editando === caso.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={urlTemp}
                            onChange={(e) => setUrlTemp(e.target.value)}
                            placeholder="Pega el URL de Google Drive"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => guardarUrl(caso.id)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition"
                            >
                              ✓ Guardar
                            </button>
                            <button
                              onClick={cancelarEdicion}
                              className="flex-1 bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition"
                            >
                              ✕ Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {caso.google_drive_url ? (
                            <button
                              onClick={() => abrirDrive(caso.google_drive_url)}
                              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                              </svg>
                              Ver Documentos
                            </button>
                          ) : (
                            <button
                              onClick={() => iniciarEdicion(caso)}
                              className="inline-flex items-center gap-2 bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm transition"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                              </svg>
                              Agregar Link
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Editar */}
                    {editando !== caso.id && caso.google_drive_url && (
                      <div className="text-right">
                        <button
                          onClick={() => iniciarEdicion(caso)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-12 bg-white rounded-lg">
              No hay casos terminados
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
