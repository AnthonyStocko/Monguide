import { usePhoto } from './Photo.jsx';

/**
 * Carte illustrée. layout "top" : image en tête (16:9), titre éventuellement
 * posé sur l'image (overlay) au-dessus d'un voile sombre qui garantit le
 * contraste ; "thumb" : vignette carrée à gauche. Photo, repli illustré et
 * crédit : voir usePhoto (credit "button" ou "inline").
 * @param {{
 *   image?: object | null, illustration?: string, alt?: string, title: string, subtitle?: string,
 *   layout?: 'top' | 'thumb', overlay?: boolean, credit?: 'button' | 'inline', headingLevel?: 2 | 3 | 4, as?: any,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 */
export default function ImageCard({
  image,
  illustration = 'landscape',
  alt = '',
  title,
  subtitle,
  layout = 'top',
  overlay = false,
  credit = 'button',
  headingLevel = 3,
  as: Tag = 'article',
  className = '',
  children
}) {
  const Heading = `h${headingLevel}`;
  const onImage = layout === 'top' && overlay;
  const heading = (
    <div className={onImage ? 'image-scrim absolute inset-x-0 bottom-0 px-4 pb-3 text-white' : ''}>
      <Heading className={`${layout === 'top' ? 'text-xl' : 'text-lg'} ${onImage ? 'text-white' : ''}`}>{title}</Heading>
      {subtitle && <p className={onImage ? 'text-white' : 'text-ink-muted'}>{subtitle}</p>}
    </div>
  );
  const { media, creditBlock } = usePhoto({
    image,
    illustration,
    alt,
    credit,
    className: layout === 'top' ? 'aspect-[16/9] w-full' : 'size-24 shrink-0 rounded-xl',
    overlay: onImage ? heading : null
  });

  if (layout === 'thumb') {
    return (
      <Tag className={`flex gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm ${className}`}>
        {media}
        <div className="min-w-0 flex-1 space-y-1">
          {heading}
          {children}
          {creditBlock}
        </div>
      </Tag>
    );
  }

  return (
    <Tag className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-sm ${className}`}>
      {media}
      {creditBlock && <div className="px-4">{creditBlock}</div>}
      {(!onImage || children) && (
        <div className="space-y-2 px-4 pt-3 pb-4">
          {!onImage && heading}
          {children}
        </div>
      )}
    </Tag>
  );
}
