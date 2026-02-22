// egov.js (CommonJS)
const { XMLParser } = require("fast-xml-parser");

const EGOV_BASE = "https://laws.e-gov.go.jp/api/1";

function makeParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
}

function ensureArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

async function getLawIdByExactName(lawName, category = 2) {
  const url = `${EGOV_BASE}/lawlists/${category}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Gov lawlists failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();

  const obj = makeParser().parse(xml);
  const infos = ensureArray(obj?.DataRoot?.ApplData?.LawNameListInfo);

  const hit = infos.find((x) => (x?.LawName || "").trim() === lawName);
  if (!hit?.LawId) throw new Error(`LawId not found for "${lawName}"`);

  return String(hit.LawId).trim();
}

async function fetchLawDataXml(lawIdOrLawNum) {
  const url = `${EGOV_BASE}/lawdata/${encodeURIComponent(lawIdOrLawNum)}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error(`e-Gov lawdata 404: ${lawIdOrLawNum}`);
  if (!res.ok) throw new Error(`e-Gov lawdata failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

module.exports = { getLawIdByExactName, fetchLawDataXml };
