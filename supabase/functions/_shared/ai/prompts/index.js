import { readFile } from 'node:fs/promises';

/**
 * Instructions système versionnées (fichiers <nom>.v<N>.md de ce dossier).
 * Une nouvelle version = un nouveau fichier (review.v2.md), jamais une
 * modification silencieuse d'une version en service. Variables {{nom}}
 * remplacées à la lecture. Côté Supabase, les fichiers sont joints à la
 * fonction par static_files (config.toml).
 */

/** Version en service de chaque jeu d'instructions. */
export const PROMPT_VERSIONS = Object.freeze({ review: 'v1' });

const cache = new Map();

/**
 * @param {string} name ex. "review"
 * @param {Record<string, string | number>} [vars] valeurs des {{variables}}
 * @param {string} [version] par défaut PROMPT_VERSIONS[name]
 * @returns {Promise<string>}
 */
export async function loadPrompt(name, vars = {}, version = PROMPT_VERSIONS[name]) {
  const key = `${name}.${version}`;
  if (!cache.has(key)) cache.set(key, await readFile(new URL(`./${key}.md`, import.meta.url), 'utf8'));
  return fillPrompt(cache.get(key), vars);
}

/**
 * Remplace les {{variables}} ; une variable sans valeur est une erreur (jamais de consigne incomplète).
 * @param {string} template
 * @param {Record<string, string | number>} vars
 */
export function fillPrompt(template, vars) {
  return template.replace(/\r\n/g, '\n').replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!(name in vars)) throw new Error(`Variable de consigne manquante : ${name}`);
    return String(vars[name]);
  });
}
