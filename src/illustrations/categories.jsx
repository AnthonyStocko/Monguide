import { C } from './palette.js';

/*
 * Vignettes carrées (96 × 96) par catégorie de lieu : dessin à plat, sol
 * vert ou table, un sujet central lisible en petit, fond sky (#faebd0).
 * Décoratives : le nom du lieu est toujours écrit à côté.
 */

/** Sol commun des vignettes d'extérieur. */
const Ground = ({ color = C.green }) => <path d="M0 74 C24 68 48 72 72 68 C84 66 90 67 96 68 V96 H0Z" fill={color} />;

export function Restaurant() {
  return (
    <>
      <rect x="0" y="62" width="96" height="34" fill={C.rust} />
      <ellipse cx="48" cy="60" rx="30" ry="11" fill={C.white} />
      <ellipse cx="48" cy="57" rx="19" ry="6" fill={C.green} />
      <rect x="10" y="30" width="4" height="30" rx="2" fill={C.rust} />
      <path d="M8 30 v8 M12 30 v8 M16 30 v8" stroke={C.rust} strokeWidth="2" strokeLinecap="round" />
      <path d="M82 30 c6 4 6 14 0 18 v12" fill="none" stroke={C.rust} strokeWidth="4" strokeLinecap="round" />
      <path d="M40 38 q-4 -6 0 -12 M50 36 q-4 -6 0 -12" fill="none" stroke={C.white} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export function Market() {
  return (
    <>
      <Ground />
      <rect x="18" y="40" width="60" height="30" fill={C.white} />
      <path d="M14 26 H82 V40 H14Z" fill={C.rust} />
      {[14, 30, 46, 62].map((x) => (
        <path key={x} d={`M${x} 40 h16 a8 8 0 0 1 -16 0Z`} fill={x % 32 === 14 ? C.rust : C.white} />
      ))}
      <rect x="18" y="58" width="60" height="12" fill={C.rust} />
      <circle cx="32" cy="54" r="6" fill={C.green} />
      <circle cx="46" cy="54" r="6" fill={C.gold} />
      <circle cx="60" cy="54" r="6" fill={C.green} />
    </>
  );
}

export function Farm() {
  return (
    <>
      <circle cx="76" cy="22" r="10" fill={C.gold} />
      <path d="M0 60 C30 48 62 58 96 50 V96 H0Z" fill={C.green} />
      <path d="M22 72 V46 L42 32 L62 46 V72Z" fill={C.rust} />
      <rect x="34" y="54" width="16" height="18" fill={C.white} />
      <path d="M34 54 L50 72 M50 54 L34 72" stroke={C.rust} strokeWidth="2.5" />
      <path d="M0 84 C30 78 66 86 96 80 V96 H0Z" fill={C.green} />
      <path d="M66 70 v-12 M72 70 v-16 M78 70 v-11" stroke={C.gold} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export function Park() {
  return (
    <>
      <Ground />
      <rect x="27" y="50" width="4" height="22" fill={C.rust} />
      <circle cx="29" cy="40" r="15" fill={C.greenDark} />
      <rect x="65" y="54" width="4" height="18" fill={C.rust} />
      <circle cx="67" cy="46" r="11" fill={C.green} />
      <rect x="38" y="66" width="22" height="4" rx="1" fill={C.rust} />
      <path d="M41 70 v6 M57 70 v6 M38 62 h22" stroke={C.rust} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export function Nature() {
  return (
    <>
      <path d="M-4 70 L30 26 L50 50 L66 34 L100 70Z" fill={C.greenDark} />
      <path d="M24 34 L30 26 L36 34 L32 32 L28 36Z M61 40 L66 34 L71 40Z" fill={C.white} />
      <Ground />
      <path d="M10 88 C30 80 52 84 70 78 C80 75 88 76 96 74" fill="none" stroke={C.blue} strokeWidth="6" strokeLinecap="round" />
    </>
  );
}

export function Viewpoint() {
  return (
    <>
      <circle cx="70" cy="26" r="11" fill={C.gold} />
      <path d="M0 58 C20 50 40 56 60 50 C74 46 86 50 96 48 V96 H0Z" fill={C.haze} />
      <path d="M0 70 C24 64 50 70 96 62 V96 H0Z" fill={C.green} />
      <path d="M14 96 V60 L34 56 V96Z" fill={C.rust} />
      <path d="M18 56 V48 M30 56 V46 M16 48 H32" stroke={C.rust} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

export function SmallHeritage() {
  return (
    <>
      <Ground />
      <path d="M26 72 V48 H70 V72" fill={C.white} stroke={C.rust} strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 50 L48 32 L76 50Z" fill={C.rust} />
      <path d="M32 72 V58 H64 V72" fill="none" stroke={C.rust} strokeWidth="3" />
      <path d="M28 76 H68" stroke={C.white} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

export function Monument() {
  return (
    <>
      <Ground />
      <path d="M22 72 V36 h8 v5 h6 v-5 h8 V52 h8 V36 h8 v5 h6 v-5 h8 V72Z" fill={C.white} stroke={C.rust} strokeWidth="3" strokeLinejoin="round" />
      <path d="M42 72 V62 a6 6 0 0 1 12 0 V72" fill={C.rust} />
      <path d="M48 52 V28" stroke={C.rust} strokeWidth="3" />
      <path d="M48 28 h12 l-3 4 l3 4 h-12Z" fill={C.gold} />
    </>
  );
}

export function Museum() {
  return (
    <>
      <rect x="0" y="74" width="96" height="22" fill={C.haze} />
      <path d="M16 36 L48 20 L80 36Z" fill={C.white} stroke={C.rust} strokeWidth="3" strokeLinejoin="round" />
      <rect x="18" y="36" width="60" height="5" fill={C.rust} />
      {[24, 38, 52, 66].map((x) => (
        <rect key={x} x={x} y="44" width="7" height="24" rx="1.5" fill={C.white} stroke={C.rust} strokeWidth="2" />
      ))}
      <rect x="14" y="68" width="68" height="6" fill={C.rust} />
      <circle cx="48" cy="30" r="3" fill={C.gold} />
    </>
  );
}

export function Personal() {
  return (
    <>
      <Ground />
      <path d="M12 84 C28 76 36 86 52 78" fill="none" stroke={C.gold} strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />
      <path d="M58 70 C46 56 40 48 40 40 a18 18 0 0 1 36 0 C76 48 70 56 58 70Z" fill={C.rust} />
      <circle cx="58" cy="40" r="7" fill={C.white} />
    </>
  );
}

export function Lodging() {
  return (
    <>
      <Ground />
      <rect x="24" y="44" width="48" height="30" fill={C.white} />
      <path d="M16 46 L48 22 L80 46Z" fill={C.rust} />
      <rect x="31" y="52" width="12" height="10" rx="1" fill={C.gold} />
      <rect x="52" y="54" width="12" height="20" rx="1" fill={C.rust} />
    </>
  );
}
