// Vérifie les longueurs de la fiche Play Store (store/listing.md) :
// titre 30, description courte 80, description longue 4 000, notes de version 500.
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('./listing.md', import.meta.url), 'utf8');
const LIMITS = { title: 30, short: 80, long: 4000, notes: 500 };
let ok = true;
for (const lang of ['fr', 'en']) {
  for (const [field, max] of Object.entries(LIMITS)) {
    const match = new RegExp(`<!-- ${field}:${lang} -->\\n([\\s\\S]*?)\\n<!-- /${field}:${lang} -->`).exec(text);
    if (!match) {
      console.log(`ÉCHEC ${field}:${lang} introuvable`);
      ok = false;
      continue;
    }
    const length = [...match[1].trim()].length;
    const pass = length <= max;
    ok &&= pass;
    console.log(`${pass ? 'OK   ' : 'ÉCHEC'} ${field}:${lang} ${length} / ${max}`);
  }
}
process.exit(ok ? 0 : 1);
