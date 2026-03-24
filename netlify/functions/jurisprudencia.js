// netlify/functions/jurisprudencia.js
// Búsqueda jurisprudencial: CGR + PJUD (via Claude agent web_search) + Qdrant

const QDRANT_COLLECTIONS = {
  dictamenes: 'rulings',
  jurisprudencia: 'relevant_jurisprudence',
};

async function searchQdrant(query, collectionKey, qdrantUrl, qdrantKey, limit = 8) {
  const collection = QDRANT_COLLECTIONS[collectionKey];
  if (!collection) return { results: [], total: 0 };
  const url = `${qdrantUrl}/collections/${collection}/points/scroll`;
  const body = {
    limit, with_payload: true, with_vector: false,
    filter: { should: [
      { key: 'page_content', match: { text: query } },
      { key: 'content', match: { text: query } },
      { key: 'text', match: { text: query } },
    ]},
  };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': qdrantKey }, body: JSON.stringify(body) });
    const data = await res.json();
    const points = data.result?.points || [];
    return {
      source: collectionKey === 'dictamenes' ? 'CGR (Qdrant)' : 'PJUD (Qdrant)',
      total: points.length,
      results: points.map(p => ({
        id: p.payload?.id || p.payload?.numero || p.payload?.rol || String(p.id),
        fecha: p.payload?.fecha || p.payload?.date || '',
        materia: (p.payload?.page_content || p.payload?.content || p.payload?.text || '').substring(0, 300),
        tipo: collectionKey === 'dictamenes' ? 'Dictamen CGR' : 'Sentencia PJUD',
        fuente: collectionKey === 'dictamenes' ? 'CGR' : 'PJUD',
        url: p.payload?.source || p.payload?.url || '',
        contenido: p.payload?.page_content || p.payload?.content || p.payload?.text || '',
        resumen: '',
      })),
    };
  } catch (e) {
    return { source: collectionKey, total: 0, results: [], error: e.message };
  }
}

async function searchWithClaudeAgent(query, sources, limit, anthropicKey) {
  const srcMap = {
    cgr: `Busca en https://www.contraloria.cl/web/cgr/buscar-jurisprudencia los ${limit} dictámenes más recientes y relevantes sobre: "${query}". Incluye también búsquedas en Google con "site:contraloria.cl ${query}".`,
    pjud: `Busca en https://www.pjud.cl/portal-unificado-sentencias las ${limit} sentencias más recientes sobre: "${query}". Incluye también búsquedas en Google con "site:pjud.cl ${query}".`,
    all: `Busca jurisprudencia sobre: "${query}" en:
1. CGR: https://www.contraloria.cl/web/cgr/buscar-jurisprudencia (busca también con site:contraloria.cl)
2. PJUD: https://www.pjud.cl/portal-unificado-sentencias (busca también con site:pjud.cl)
Devuelve los ${limit} más relevantes de cada fuente.`,
  };

  const systemPrompt = `Eres un asistente jurídico experto en derecho administrativo chileno. Busca jurisprudencia y devuelve SOLO JSON válido con este formato exacto:
{
  "total": number,
  "resultados": [
    {
      "id": "número dictamen o ROL",
      "fecha": "fecha en formato DD-MM-YYYY",
      "materia": "descripción de la materia (máx 200 chars)",
      "tipo": "Dictamen CGR" | "Oficio CGR" | "Sentencia PJUD",
      "fuente": "CGR" | "PJUD",
      "url": "URL directa si disponible",
      "resumen": "resumen de 2-3 oraciones del contenido jurídico"
    }
  ],
  "fuentes_consultadas": ["CGR", "PJUD"],
  "busqueda": "query usado"
}
No incluyas texto fuera del JSON.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: srcMap[sources] || srcMap.all }],
      }),
    });
    const data = await response.json();
    let text = '';
    for (const block of data.content || []) { if (block.type === 'text') text += block.text; }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        source: 'Web (CGR + PJUD)',
        total: parsed.total || parsed.resultados?.length || 0,
        results: (parsed.resultados || []).map(r => ({
          id: r.id || '', fecha: r.fecha || '', materia: r.materia || '',
          tipo: r.tipo || 'Dictamen CGR', fuente: r.fuente || 'CGR',
          url: r.url || '', resumen: r.resumen || '', contenido: r.resumen || '',
        })),
        fuentesConsultadas: parsed.fuentes_consultadas || [],
      };
    }
    return { source: 'Web', total: 0, results: [], error: 'No JSON', rawText: text.substring(0, 500) };
  } catch (e) {
    return { source: 'Web', total: 0, results: [], error: e.message };
  }
}

async function summarizeResults(results, query, caseContext, anthropicKey) {
  const resultsText = results.slice(0, 15).map((r, i) =>
    `${i + 1}. [${r.tipo}] ID: ${r.id} | Fecha: ${r.fecha}\n   Materia: ${r.materia}\n   ${r.resumen || r.contenido || ''}`
  ).join('\n\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 3000,
        system: 'Eres Fiscalito, asistente jurídico–administrativo de la UMAG especializado en procedimientos disciplinarios. Aplica perspectiva de género, debido proceso y principios del Estatuto Administrativo.',
        messages: [{ role: 'user', content: `CONSULTA: ${query}\n${caseContext ? '\nCONTEXTO DEL EXPEDIENTE:\n' + caseContext : ''}\n\nRESULTADOS JURISPRUDENCIALES:\n${resultsText}\n\nElabora un análisis jurisprudencial integrado que:\n1. Identifique las fuentes más relevantes para el caso\n2. Extraiga los criterios jurídicos aplicables al expediente\n3. Señale tesis en tensión o evolución jurisprudencial si las hay\n4. Proponga una estrategia de aplicación al caso concreto\n5. Cite cada fuente con su número/ROL y fecha\n\nUsa lenguaje institucional formal y estructura con títulos en negrita.` }],
      }),
    });
    const data = await res.json();
    return data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  } catch (e) { return `Error al generar análisis: ${e.message}`; }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY');
  const qdrantUrl = Netlify.env.get('QDRANT_URL');
  const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
  if (!anthropicKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const { query, sources = 'all', limit = 10, summarize = false, caseContext = '' } = await req.json();
  if (!query) return new Response(JSON.stringify({ error: 'query es requerido' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const promises = [];
    if (qdrantUrl && qdrantKey && sources !== 'pjud') promises.push(searchQdrant(query, 'dictamenes', qdrantUrl, qdrantKey, Math.ceil(limit / 2)));
    if (qdrantUrl && qdrantKey && sources !== 'cgr') promises.push(searchQdrant(query, 'jurisprudencia', qdrantUrl, qdrantKey, Math.ceil(limit / 2)));
    if (sources !== 'qdrant') promises.push(searchWithClaudeAgent(query, sources, limit, anthropicKey));

    const searchResults = await Promise.all(promises);
    const allResults = [];
    const bySource = {};
    for (const sr of searchResults) {
      if (sr.results?.length) { allResults.push(...sr.results); bySource[sr.source] = sr.results.length; }
    }
    const seen = new Set();
    const deduped = allResults.filter(r => { const k = `${r.id}-${r.fuente}`; if (seen.has(k)) return false; seen.add(k); return true; });

    let analisis = null;
    if (summarize && deduped.length > 0) analisis = await summarizeResults(deduped, query, caseContext, anthropicKey);

    return new Response(JSON.stringify({ ok: true, query, total: deduped.length, bySource, resultados: deduped.slice(0, limit * 2), analisis }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/.netlify/functions/jurisprudencia' };
