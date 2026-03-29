/**
 * Netlify Function: rag (ESM)
 * Searches Qdrant collections using Google gemini-embedding-001 (768 dims)
 * to match the indexed data.
 */

/* ── Google Service Account OAuth2 for Embeddings ── */
async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/generative-language',
    aud: sa.token_uri,
    iat: now, exp: now + 3600
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signatureInput = `${header}.${payload}`;
  const pemContents = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signatureInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${sig}`;

  const r = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await r.json();
  return data.access_token;
}

async function getEmbedding(text, accessToken) {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        content: { parts: [{ text: text.substring(0, 4096) }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768
      })
    });
    if (!r.ok) { console.error('Embedding error:', r.status, await r.text()); return null; }
    const data = await r.json();
    return data?.embedding?.values || null;
  } catch (e) { console.error('Embedding exception:', e); return null; }
}

/* ── Qdrant Search ── */
async function searchQdrant(query, collection, qdrantUrl, qdrantKey, accessToken, limit = 5) {
  try {
    const vector = await getEmbedding(query, accessToken);
    if (!vector) { console.error('No embedding for query'); return []; }

    const headers = { 'Content-Type': 'application/json' };
    if (qdrantKey) headers['api-key'] = qdrantKey;

    const r = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ vector, limit, with_payload: true })
    });

    if (!r.ok) {
      console.warn(`Qdrant search ${collection}: ${r.status}`);
      return [];
    }

    const data = await r.json();
    return (data.result || []).map(p => ({
      score: p.score,
      text: p.payload?.text || p.payload?.content || '',
      source: p.payload?.source_name || p.payload?.source || collection,
      collection
    }));
  } catch (e) {
    console.warn(`Qdrant search error (${collection}):`, e.message);
    return [];
  }
}

/* ── Collection names that exist in Qdrant ── */
const FISCALITO_COLLECTIONS = [
  'relevant_jurisprudence',
  'reference_books',
  'specific_topics',
  'rulings',
  'administrative_discipline',
  'current_regulations',
  'material',
  'comercial',
  'propiedad_intelectual',
  'civil',
];

const FOLDER_ALIASES = {
  normativa: 'current_regulations',
  dictamenes: 'rulings',
  jurisprudencia: 'relevant_jurisprudence',
  doctrina: 'administrative_discipline',
  libros: 'reference_books',
  tematicas: 'specific_topics',
  material: 'material',
  comercial: 'comercial',
};

/* ── Handler ── */
export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') return new Response('', { headers });

  try {
    const body = await req.json();
    const { query, folder = 'todos', caseContext = '' } = body;

    if (!query) return new Response(JSON.stringify({ error: 'query is required' }), { status: 400, headers });

    const qdrantUrl = Netlify.env.get('QDRANT_URL');
    const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
    const saKey = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    if (!qdrantUrl) return new Response(JSON.stringify({ error: 'QDRANT_URL not configured', context: '', sources: [] }), { headers });
    if (!saKey) return new Response(JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY not configured', context: '', sources: [] }), { headers });

    const sa = JSON.parse(saKey);
    const accessToken = await getGoogleAccessToken(sa);

    /* Determine which collections to search */
    const targetCollection = FOLDER_ALIASES[folder];
    const collectionsToSearch = targetCollection
      ? [targetCollection]
      : FISCALITO_COLLECTIONS;

    /* Search all target collections in parallel */
    const searchPromises = collectionsToSearch.map(col =>
      searchQdrant(query, col, qdrantUrl, qdrantKey, accessToken, 4)
    );
    const searchResults = await Promise.all(searchPromises);

    /* Flatten, deduplicate and sort by score */
    const allResults = searchResults.flat().filter(r => r.text && r.text.length > 20);
    allResults.sort((a, b) => b.score - a.score);

    /* Take top results */
    const topResults = allResults.slice(0, 10);

    if (topResults.length === 0) {
      return new Response(JSON.stringify({ context: '', sources: [], message: 'No relevant documents found' }), { headers });
    }

    /* Build context string */
    const context = topResults
      .map(r => `[Fuente: ${r.source} | Colección: ${r.collection} | Relevancia: ${(r.score * 100).toFixed(0)}%]\n${r.text}`)
      .join('\n\n---\n\n');

    const sources = [...new Set(topResults.map(r => r.source))];

    return new Response(JSON.stringify({ context, sources, count: topResults.length }), { headers });

  } catch (err) {
    console.error('RAG error:', err);
    return new Response(JSON.stringify({ error: err.message, context: '', sources: [] }), { status: 500, headers });
  }
};
