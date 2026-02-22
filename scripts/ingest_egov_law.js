#!/usr/bin/env node
// scripts/ingest_egov_law.js
const fs = require("fs/promises");
const path = require("path");
const { getLawIdByExactName, fetchLawDataXml } = require("../egov");

async function main() {
  const lawName = process.argv[2];
  const outFile = process.argv[3]; // e.g. sources/rouki.xml

  if (!lawName || !outFile) {
    console.log('Usage: node scripts/ingest_egov_law.js "労働基準法" sources/rouki.xml');
    process.exit(1);
  }

  const outPath = path.join(process.cwd(), outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const lawId = await getLawIdByExactName(lawName, 2);
  const xml = await fetchLawDataXml(lawId);

  await fs.writeFile(outPath, xml, "utf8");

  console.log("Saved:", outFile);
  console.log("lawId:", lawId);
  console.log("bytes:", Buffer.byteLength(xml, "utf8"));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
