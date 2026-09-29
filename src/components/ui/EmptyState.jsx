import { m } from 'motion/react';
import Illustration from '../../illustrations/index.jsx';
import { useFirstShow, useMotionAllowed, variants } from '../../ui/motion.js';

/**
 * État vide : illustration maison (ou icône), titre, explication et action
 * facultative.
 * @param {{ illustration?: import('../../illustrations/index.jsx').IllustrationName, icon?: import('react').ComponentType<any>, title: string, description?: string, action?: import('react').ReactNode }} props
 */
export default function EmptyState({ illustration, icon: Icon, title, description, action }) {
  // Apparition au premier affichage de cet état pendant la session seulement.
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow(`empty:${illustration}:${title}`);
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      {illustration ? (
        <m.div className="w-full max-w-64" variants={variants.appear} initial={allowed && firstShow ? 'hidden' : false} animate="visible">
          <Illustration name={illustration} className="aspect-[4/3] w-full rounded-3xl" />
        </m.div>
      ) : (
        Icon && (
          <div className="flex size-16 items-center justify-center rounded-full bg-primary-soft">
            <Icon aria-hidden="true" className="size-8 text-primary" />
          </div>
        )
      )}
      <h2 className="text-2xl">{title}</h2>
      {description && <p className="max-w-md text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
