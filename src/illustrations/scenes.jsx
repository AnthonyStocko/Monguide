import { C } from './palette.js';

/*
 * Scènes larges : paysage de destination par défaut (320 × 180), états vides
 * (240 × 180), écrans d'accueil (320 × 240). Animations (classes ill-*,
 * index.css) : soleil qui tourne très lentement, nuage qui dérive, repère qui
 * sautille ; toutes coupées avec les autres (réglage ou téléphone).
 */

/** Soleil à rayons (la rotation se voit grâce aux rayons). */
function Sun({ cx, cy, r = 16, spin = true }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const [x1, y1, x2, y2] = [r + 5, r + 5, r + 12, r + 12].map((d, j) => (j % 2 ? cy + Math.sin(a) * d : cx + Math.cos(a) * d));
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join(' ');
  return (
    <g className={spin ? 'ill-spin' : undefined}>
      <path d={rays} stroke={C.gold} strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} fill={C.gold} />
    </g>
  );
}

function Cloud({ x, y, s = 1, color = C.white, drift = true }) {
  return (
    <g className={drift ? 'ill-drift' : undefined}>
      <path
        transform={`translate(${x} ${y}) scale(${s})`}
        d="M8 24 a10 10 0 0 1 4 -19 a14 14 0 0 1 26 4 a9 9 0 0 1 4 15Z"
        fill={color}
      />
    </g>
  );
}

/** Paysage de destination par défaut : collines, village, soleil. */
export function Landscape() {
  return (
    <>
      <Sun cx={254} cy={48} r={18} />
      <Cloud x={60} y={30} s={1.3} />
      <path d="M0 118 C50 92 110 104 160 94 C220 82 270 96 320 88 V180 H0Z" fill={C.green} opacity="0.55" />
      {[
        [128, 88],
        [150, 80],
        [174, 86]
      ].map(([x, y]) => (
        <g key={x}>
          <rect x={x} y={y} width="18" height="18" fill={C.white} />
          <path d={`M${x - 3} ${y + 1} L${x + 9} ${y - 10} L${x + 21} ${y + 1}Z`} fill={C.rust} />
        </g>
      ))}
      <rect x="198" y="72" width="8" height="32" fill={C.white} />
      <path d="M195 73 L202 58 L209 73Z" fill={C.rust} />
      <path d="M0 134 C70 110 150 128 210 118 C260 110 290 118 320 114 V180 H0Z" fill={C.green} />
      <path d="M150 180 C160 158 190 144 240 134" fill="none" stroke={C.sky} strokeWidth="9" strokeLinecap="round" />
    </>
  );
}

/** Aucun séjour : valise prête, étiquette vierge. */
export function NoTrips() {
  return (
    <>
      <Cloud x={24} y={28} s={1.1} color={C.white} />
      <ellipse cx="120" cy="150" rx="70" ry="8" fill={C.haze} />
      <rect x="92" y="54" width="56" height="18" rx="7" fill="none" stroke={C.rust} strokeWidth="7" />
      <rect x="66" y="66" width="108" height="80" rx="12" fill={C.rust} />
      <path d="M92 66 V146 M148 66 V146" stroke={C.gold} strokeWidth="7" />
      <path d="M174 84 l20 -6 v22 l-20 -6Z" fill={C.white} />
    </>
  );
}

/** Hors ligne : nuage et ondes interrompues. */
export function Offline() {
  return (
    <>
      <Cloud x={52} y={36} s={3.2} color={C.white} />
      <path d="M92 122 a40 40 0 0 1 56 0 M104 134 a22 22 0 0 1 32 0" fill="none" stroke={C.rust} strokeWidth="7" strokeLinecap="round" />
      <circle cx="120" cy="146" r="6" fill={C.rust} />
      <path d="M82 104 L158 160" stroke={C.ink} strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="120" cy="168" rx="56" ry="6" fill={C.haze} />
    </>
  );
}

/** Erreur : poteau indicateur penché, panneaux de travers. */
export function ErrorScene() {
  return (
    <>
      <ellipse cx="120" cy="160" rx="72" ry="8" fill={C.haze} />
      <path d="M118 160 L126 44" stroke={C.rust} strokeWidth="8" strokeLinecap="round" />
      <path d="M126 58 L176 66 L186 80 L172 90 L122 82Z" fill={C.gold} />
      <path d="M122 96 L76 110 L64 100 L74 88 L120 76Z" fill={C.white} />
      <path d="M100 150 l6 -10 l6 10Z M140 152 l5 -8 l5 8Z" fill={C.rust} />
    </>
  );
}

/** Aucun résultat : loupe sur une carte vide. */
export function NoResults() {
  return (
    <>
      <path d="M46 40 L96 28 L146 40 L196 28 V140 L146 152 L96 140 L46 152Z" fill={C.white} />
      <path d="M96 28 V140 M146 40 V152" stroke={C.haze} strokeWidth="4" />
      <circle cx="122" cy="88" r="30" fill={C.white} stroke={C.blue} strokeWidth="8" />
      <path d="M144 110 L172 138" stroke={C.rust} strokeWidth="12" strokeLinecap="round" />
    </>
  );
}

/** Accueil 1 — préparer : carte, itinéraire, repère qui sautille. */
export function OnboardingPrepare() {
  return (
    <>
      <path d="M40 60 L120 40 L200 60 L280 40 V200 L200 220 L120 200 L40 220Z" fill={C.white} />
      <path d="M120 40 V200 M200 60 V220" stroke={C.haze} strokeWidth="5" />
      <path d="M78 186 C110 150 150 176 176 138 C196 110 222 120 238 96" fill="none" stroke={C.rust} strokeWidth="5" strokeDasharray="2 12" strokeLinecap="round" />
      <circle cx="78" cy="186" r="9" fill={C.rust} />
      <g className="ill-hop">
        <path d="M238 92 C226 78 220 70 220 60 a18 18 0 0 1 36 0 C256 70 250 78 238 92Z" fill={C.green} />
        <circle cx="238" cy="60" r="7" fill={C.white} />
      </g>
    </>
  );
}

/** Accueil 2 — suivre sa journée : chemin ponctué d'étapes sous le soleil. */
export function OnboardingFollow() {
  return (
    <>
      <Sun cx={250} cy={56} r={20} />
      <path d="M0 170 C80 140 180 160 320 140 V240 H0Z" fill={C.green} />
      <path d="M40 240 C80 200 140 214 180 190 C220 166 250 176 290 160" fill="none" stroke={C.white} strokeWidth="14" strokeLinecap="round" />
      {[
        [84, 214],
        [178, 190],
        [262, 168]
      ].map(([x, y], i) => (
        <circle key={x} cx={x} cy={y} r="11" fill={i === 1 ? C.gold : C.rust} stroke={C.white} strokeWidth="4" />
      ))}
    </>
  );
}

/** Accueil 3 — partir l'esprit libre : route vers l'horizon, oiseaux, nuage. */
export function OnboardingFree() {
  return (
    <>
      <Sun cx={160} cy={118} r={30} spin={false} />
      <Cloud x={34} y={48} s={1.6} />
      <path d="M0 140 C60 128 110 136 160 132 C220 128 270 134 320 128 V240 H0Z" fill={C.green} />
      <path d="M140 240 L156 136 H164 L180 240Z" fill={C.white} />
      <path d="M222 60 q8 -8 16 0 q8 -8 16 0 M258 84 q6 -6 12 0 q6 -6 12 0" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
    </>
  );
}
