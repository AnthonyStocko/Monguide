/**
 * Translittération du grec en caractères latins selon ELOT 743 (norme
 * grecque, reprise par l'ONU et les passeports grecs). Fonction pure : les
 * caractères non grecs (lettres latines, chiffres, ponctuation) sont gardés
 * tels quels.
 *
 *  - lettres : α a, β v, γ g, δ d, ε e, ζ z, η i, θ th, ι i, κ k, λ l, μ m,
 *    ν n, ξ x, ο o, π p, ρ r, σ ς s, τ t, υ y, φ f, χ ch, ψ ps, ω o ;
 *  - groupes : αι ai, ει ei, οι oi, ου ou, υι yi, γγ ng, γξ nx, γχ nch
 *    (γκ gk, μπ mp, ντ nt se déduisent lettre à lettre) ;
 *  - αυ, ευ, ηυ : av, ev, iv devant une voyelle ou une consonne sonore
 *    (β γ δ ζ λ μ ν ρ), af, ef, if ailleurs (consonne sourde, fin de mot) ;
 *  - accents ignorés ; un tréma sur la seconde voyelle sépare le groupe
 *    (αϊ a-i, αϋ a-y) ;
 *  - casse : « Θήβα » donne « Thiva », « ΘΗΒΑ » donne « THIVA ».
 */

const LETTERS = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o'
};

/** Groupes de deux lettres, le second sans tréma. */
const PAIRS = { αι: 'ai', ει: 'ei', οι: 'oi', ου: 'ou', υι: 'yi', γγ: 'ng', γξ: 'nx', γχ: 'nch' };

/** Première voyelle de αυ, ευ, ηυ. */
const BEFORE_U = { α: 'a', ε: 'e', η: 'i' };

const VOWELS = new Set('αεηιουω');
const VOICED = new Set('βγδζλμνρ');

const COMBINING = /\p{M}/u;
const DIAERESIS = '̈';

/**
 * Découpe un texte en caractères de base et leurs signes diacritiques (NFD).
 * @returns {{ raw: string, base: string, lower: string, upper: boolean, diaeresis: boolean }[]}
 */
function tokens(text) {
  const out = [];
  for (const ch of text.normalize('NFD')) {
    const last = out[out.length - 1];
    if (last && COMBINING.test(ch)) {
      last.raw += ch;
      if (ch === DIAERESIS) last.diaeresis = true;
      continue;
    }
    const lower = ch.toLowerCase();
    out.push({ raw: ch, base: ch, lower, upper: ch !== lower, diaeresis: false });
  }
  return out;
}

const isGreek = (t) => t !== undefined && t.lower in LETTERS;

/** Applique la casse grecque à la transcription latine. */
function withCase(latin, token, next) {
  if (!token.upper) return latin;
  // Mot en capitales (lettre suivante aussi en capitale) : tout en capitales.
  if (latin.length > 1 && next && isGreek(next) && next.upper) return latin.toUpperCase();
  return latin[0].toUpperCase() + latin.slice(1);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function translitGreek(text) {
  const list = tokens(text);
  let out = '';
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    if (!isGreek(t)) {
      out += t.raw;
      continue;
    }
    const next = list[i + 1];
    const pair = isGreek(next) && !next.diaeresis ? t.lower + next.lower : null;
    if (pair && t.lower in BEFORE_U && next.lower === 'υ') {
      const after = list[i + 2];
      const soft = isGreek(after) && (VOWELS.has(after.lower) || VOICED.has(after.lower));
      out += withCase(BEFORE_U[t.lower], t, next) + withCase(soft ? 'v' : 'f', next, after);
      i += 1;
    } else if (pair && pair in PAIRS) {
      const latin = PAIRS[pair];
      const caps = t.upper && next.upper;
      out += caps ? latin.toUpperCase() : withCase(latin, t, null);
      i += 1;
    } else {
      out += withCase(LETTERS[t.lower], t, next);
    }
  }
  return out.normalize('NFC');
}

