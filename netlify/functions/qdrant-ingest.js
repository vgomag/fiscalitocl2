/**
 * Netlify Function: qdrant-ingest
 * Handles: embed text → upsert to Qdrant, collection management
 * Uses: QDRANT_URL, QDRANT_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY (for embeddings)
 */
const crypto = require('crypto');
const https = require('https');

/* ── Google Service Account Auth (for embeddings) ── */
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/generative-language',
    aud: sa.token_uri,
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${header}.${payload}.${sig}`;

  const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  return data.access_token;
}

/* ── Embeddings via Google gemini-embedding-001 ── */
async function getEmbedding(text, accessToken) {
  const truncated = text.substring(0, 4096);
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        content: { parts: [{ text: truncated }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768
      })
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error('Embedding error:', res.status, err);
    return null;
  }
  const data = await res.json();
  return data?.embedding?.values || null;
}

/* ── Qdrant API helpers ── */
async function qdrantFetch(path, method, body) {
  const QDRANT_URL = process.env.QDRANT_URL;
  const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
  if (!QDRANT_URL) throw new Error('QDRANT_URL not configured');

  const headers = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;

  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) })
  });

  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function ensureCollection(name, vectorSize = 768) {
  const info = await qdrantFetch(`/collections/${name}`, 'GET');
  if (info.ok) {
    const size = info.data?.result?.config?.params?.vectors?.size;
    if (size && size !== vectorSize) {
      await qdrantFetch(`/collections/${name}`, 'DELETE');
    } else {
      return true;
    }
  }
  const create = await qdrantFetch('/collections/' + name, 'PUT', {
    vectors: { size: vectorSize, distance: 'Cosine' },
    optimizers_config: { default_segment_number: 2 }
  });
  return create.ok;
}

/* ── Text chunking (legal-aware) ── */
function splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?;:])\s+|(?=\n\s*(?:Art(?:ículo)?\.?\s*\d|[IVXLCDM]+\.\s|\d+[.)]\s|[a-z]\)\s))/i);
  let current = '';
  let overlapBuf = '';

  for (const s of sentences) {
    if (current.length + s.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(/\s+/);
      overlapBuf = words.slice(-Math.floor(overlap / 5)).join(' ');
      current = overlapBuf + ' ' + s;
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.substring(i, i + chunkSize));
    }
  }
  return chunks;
}

/* ── PII Sanitizer ── */
function sanitizePii(text) {
  return text
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}[-–]\d{1,2}\b/g, '[RUT]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\+?\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g, '[PHONE]');
}

/* ── Handler ── */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');

    /* ── ACTION: ingest ── */
    if (action === 'ingest') {
      const { collection, documents, chunkSize = 1000, chunkOverlap = 200, sanitize = false } = body;
      if (!collection || !documents?.length) throw new Error('collection and documents required');

      // Ensure collection exists
      await ensureCollection(collection, 768);

      // Get Google access token for embeddings
      const accessToken = await getGoogleAccessToken(sa);

      let totalPoints = 0;
      const errors = [];

      for (const doc of documents) {
        let text = doc.text || '';
        if (!text) continue;

        if (sanitize) text = sanitizePii(text);

        const chunks = splitIntoChunks(text, chunkSize, chunkOverlap);
        const points = [];

        for (let i = 0; i < chunks.length; i++) {
          const vector = await getEmbedding(chunks[i], accessToken);
          if (!vector) { errors.push(`Embedding failed for chunk ${i} of ${doc.id}`); continue; }

          const pointId = crypto.createHash('md5').update(`${doc.id}_chunk_${i}`).digest('hex');
          // Convert MD5 hex to UUID format for Qdrant
          const uuid = `${pointId.slice(0,8)}-${pointId.slice(8,12)}-${pointId.slice(12,16)}-${pointId.slice(16,20)}-${pointId.slice(20)}`;

          points.push({
            id: uuid,
            vector,
            payload: {
              text: chunks[i],
              source_id: doc.id,
              source_name: doc.metadata?.name || doc.id,
              chunk_index: i,
              total_chunks: chunks.length,
              collection,
              ...(doc.metadata || {})
            }
          });
        }

        if (points.length > 0) {
          // Batch upsert (max 100 points per request)
          for (let b = 0; b < points.length; b += 100) {
            const batch = points.slice(b, b + 100);
            const result = await qdrantFetch(`/collections/${collection}/points?wait=true`, 'PUT', { points: batch });
            if (!result.ok) {
              errors.push(`Upsert failed for ${doc.id}: ${JSON.stringify(result.data)}`);
            } else {
              totalPoints += batch.length;
            }
          }
        }
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, totalPoints, errors: errors.length ? errors : undefined })
      };
    }

    /* ── ACTION: list-collections ── */
    if (action === 'list-collections') {
      const result = await qdrantFetch('/collections', 'GET');
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    /* ── ACTION: collection-info ── */
    if (action === 'collection-info') {
      const { collection } = body;
      const result = await qdrantFetch(`/collections/${collection}`, 'GET');
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    /* ── ACTION: create-collection ── */
    if (action === 'create-collection') {
      const { collection, vectorSize = 768 } = body;
      const ok = await ensureCollection(collection, vectorSize);
      return { statusCode: 200, headers, body: JSON.stringify({ success: ok }) };
    }

    /* ── ACTION: delete-collection ── */
    if (action === 'delete-collection') {
      const { collection } = body;
      const result = await qdrantFetch(`/collections/${collection}`, 'DELETE');
      return { statusCode: 200, headers, body: JSON.stringify({ success: result.ok }) };
    }

    /* ── ACTION: search ── */
    if (action === 'search') {
      const { collection, query, limit = 5 } = body;
      const accessToken = await getGoogleAccessToken(sa);
      const vector = await getEmbedding(query, accessToken);
      if (!vector) throw new Error('Failed to generate query embedding');

      const result = await qdrantFetch(`/collections/${collection}/points/search`, 'POST', {
        vector, limit, with_payload: true
      });
      return { statusCode: 200, headers, body: JSON.stringify(result.data) };
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
  }
};
