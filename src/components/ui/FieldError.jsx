import { CircleAlert } from 'lucide-react';

/** Message d'erreur d'un champ, relié au champ par aria-describedby (id). */
export default function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} className="flex items-start gap-2 font-medium text-danger-on-soft">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
