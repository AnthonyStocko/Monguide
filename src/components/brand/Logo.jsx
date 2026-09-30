import { useId } from 'react';
import { BRAND_COLORS, LOGO_LAYOUT, LOGO_SIZE, PIN_BOX, pinLayers } from '../../brand/logo.js';
import { WORDMARK } from '../../brand/wordmark.js';

/** Repère (coordonnées 1024) en éléments React ; clipId unique par instance. */
function PinPaths({ variant, clipId }) {
  const { clip, layers } = pinLayers(variant);
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={clip} />
        </clipPath>
      </defs>
      {layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} fillRule={l.evenOdd ? 'evenodd' : undefined} clipPath={l.clipped ? `url(#${clipId})` : undefined} />
      ))}
    </>
  );
}

/**
 * Repère seul (icône « Mon guide »), décoratif : le nom est porté par le texte voisin.
 * @param {{ className?: string, variant?: 'color' | 'onGreen' | 'mono' }} props
 */
export function LogoMark({ className = '', variant = 'color' }) {
  const clipId = useId();
  return (
    <svg viewBox={`${PIN_BOX.x} ${PIN_BOX.y} ${PIN_BOX.width} ${PIN_BOX.height}`} aria-hidden="true" focusable="false" className={className}>
      <PinPaths variant={variant} clipId={clipId} />
    </svg>
  );
}

/**
 * Logo principal (repère + nom en tracés, sans dépendre de la police),
 * depuis la source unique src/brand/logo.js. Lu « Mon guide » par les
 * lecteurs d'écran (role="img").
 * @param {{ className?: string, label?: string }} props className : hauteur (ex. "h-8 w-auto")
 */
export default function Logo({ className = '', label = 'Mon guide' }) {
  const clipId = useId();
  return (
    <svg viewBox={`0 0 ${LOGO_SIZE.width} ${LOGO_SIZE.height}`} role="img" aria-label={label} className={className}>
      <g transform={LOGO_LAYOUT.pin}>
        <PinPaths variant="color" clipId={clipId} />
      </g>
      <path transform={LOGO_LAYOUT.text} d={WORDMARK.d} fill={BRAND_COLORS.ink} />
    </svg>
  );
}
