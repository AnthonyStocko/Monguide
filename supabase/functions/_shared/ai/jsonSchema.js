/**
 * Vérification d'une valeur contre un schéma JSON, sous-ensemble suffisant
 * pour les réponses de l'IA (aucune dépendance) : type (ou liste de types),
 * enum, const, properties, required, additionalProperties (booléen ou
 * schéma), items, minItems, maxItems, minLength, maxLength, minimum,
 * maximum, pattern. Un mot-clé non pris en charge est ignoré : les schémas
 * de Mon guide n'utilisent que ceux-ci.
 */

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const matchesType = (v, t) => t === typeOf(v) || (t === 'number' && typeof v === 'number' && Number.isFinite(v));

/**
 * @param {unknown} value
 * @param {object} schema
 * @param {string} [path]
 * @returns {string[]} écarts ("chemin: raison"), vide si la valeur est conforme
 */
export function validateJson(value, schema, path = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return errors;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) return [`${path}: type ${types.join('|')} attendu`];
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push(`${path}: valeur hors liste`);
  if ('const' in schema && schema.const !== value) errors.push(`${path}: valeur ${JSON.stringify(schema.const)} attendue`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: trop court`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: trop long`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: format invalide`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: inférieur à ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: supérieur à ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: moins de ${schema.minItems} éléments`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: plus de ${schema.maxItems} éléments`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateJson(item, schema.items, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: requis`);
    for (const [key, v] of Object.entries(value)) {
      if (key in props) errors.push(...validateJson(v, props[key], `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: non prévu`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validateJson(v, schema.additionalProperties, `${path}.${key}`));
    }
  }
  return errors;
}

/**
 * Texte renvoyé par un modèle -> valeur JSON conforme, ou null. Tolère une
 * clôture de bloc de code (```json … ```) autour du JSON.
 * @param {string | null | undefined} text
 * @param {object} schema
 * @returns {{ ok: true, json: unknown } | { ok: false, errors: string[] }}
 */
export function parseJsonResponse(text, schema) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: ['réponse vide'] };
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/u, '$1');
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, errors: ['JSON illisible'] };
  }
  const errors = validateJson(json, schema);
  return errors.length ? { ok: false, errors } : { ok: true, json };
}
