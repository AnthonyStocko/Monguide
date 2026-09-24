/**
 * Lecture minimale d'un classeur XLSX (première feuille), sans dépendance :
 * un XLSX est une archive ZIP de fichiers XML. Décompression par
 * DecompressionStream("deflate-raw"), disponible dans Deno et Node 18+.
 * Suffisant pour les fichiers simples du Bulletin pétrolier (valeurs, textes
 * partagés, dates en nombre de série Excel).
 */

const td = new TextDecoder();

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Fichiers d'une archive ZIP (répertoire central).
 * @param {Uint8Array} zip
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzip(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new TypeError('ZIP : fin de répertoire introuvable');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);

  const files = new Map();
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new TypeError('ZIP : répertoire central invalide');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = td.decode(zip.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + extraLength + commentLength;

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflateRaw(data));
    else throw new TypeError(`ZIP : méthode de compression ${method} non prise en charge`);
  }
  return files;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** Numéro de colonne (0 = A) d'une référence de cellule "AB12". */
function columnIndex(ref) {
  let n = 0;
  for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Lignes de la première feuille : tableau de lignes, chaque ligne un tableau
 * de valeurs (nombre, texte ou null).
 * @param {Uint8Array} bytes contenu du fichier .xlsx
 * @returns {Promise<(string | number | null)[][]>}
 */
export async function readFirstSheet(bytes) {
  const files = await unzip(bytes);
  const shared = files.has('xl/sharedStrings.xml')
    ? [...td.decode(files.get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeXml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''))
      )
    : [];
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new TypeError('XLSX : aucune feuille');
  const xml = td.decode(files.get(sheetName));

  const rows = [];
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1];
      const type = /t="([^"]+)"/.exec(c[1])?.[1];
      const raw = c[2] ? /<v>([^<]*)<\/v>/.exec(c[2])?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(c[2])?.[1] : undefined;
      let value = null;
      if (raw !== undefined) {
        if (type === 's') value = shared[Number(raw)] ?? null;
        else if (type === 'str' || type === 'inlineStr') value = decodeXml(raw);
        else value = raw === '' ? null : Number(raw);
      }
      values[ref ? columnIndex(ref) : values.length] = value;
    }
    rows.push(Array.from(values, (v) => v ?? null));
  }
  return rows;
}

/**
 * Date d'un nombre de série Excel (système 1900).
 * @param {number} serial
 * @returns {string} "YYYY-MM-DD"
 */
export function excelSerialToDate(serial) {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000).toISOString().slice(0, 10);
}
