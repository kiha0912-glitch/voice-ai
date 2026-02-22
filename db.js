const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "sources", "index.sqlite");

function openDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
      source_id,
      content
    );
  `);
  return db;
}

module.exports = { openDb, DB_PATH };
