const fs = require("fs/promises");
const path = require("path");
const { openDb, DB_PATH } = require("../db");

function xmlToText(xml) {
  // 超簡易：タグを落とす（最小構成）
  return String(xml || "").replace(/<[^>]+>/g, " ");
}

function chunk(text, size = 1000, overlap = 100) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const out = [];
  let i = 0;

  while (i < t.length) {
    const end = Math.min(i + size, t.length);
    out.push(t.slice(i, end));
    if (end === t.length) break;
    i = Math.max(0, end - overlap);
  }
  return out;
}

async function main() {
  const file = path.join(process.cwd(), "sources", "rouki.xml");
  const xml = await fs.readFile(file, "utf8");

  const text = xmlToText(xml);

  const db = openDb();

  // 既存のインデックスをクリア
  db.exec("DELETE FROM chunks;");

  const parts = chunk(text, 1000, 100);

  const stmt = db.prepare("INSERT INTO chunks (source_id, content) VALUES (?, ?)");

  for (let i = 0; i < parts.length; i++) {
    stmt.run("sources/rouki.xml", parts[i]);
  }

  db.close();

  console.log("DB:", DB_PATH);
  console.log("Indexed chunks:", parts.length);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
