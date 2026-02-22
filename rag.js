// rag.js (CommonJS)
// SQLite(FTS5)の chunks を検索して、OpenAIに渡す「根拠テキスト」を作る

const { openDb } = require("./db");

function normalizeFtsQuery(q) {
  return String(q || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchChunks(query, limit = 5) {
  const q = normalizeFtsQuery(query);
  if (!q) return [];

  const db = openDb();

  const rows = db
    .prepare(
      `
      SELECT
        source_id,
        snippet(chunks, 1, '【', '】', ' … ', 12) AS snippet,
        bm25(chunks) AS score
      FROM chunks
      WHERE chunks MATCH ?
      ORDER BY score ASC
      LIMIT ?
    `
    )
    .all(q, limit);

  db.close();
  return rows;
}

function buildRagContext(results) {
  if (!results || results.length === 0) return "";

  const blocks = results.map((r, i) => {
    return [
      `【根拠${i + 1}】source_id=${r.source_id}`,
      `excerpt=${r.snippet || ""}`,
    ].join("\n");
  });

  return blocks.join("\n\n");
}

module.exports = {
  searchChunks,
  buildRagContext,
};
