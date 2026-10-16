import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { myProfile, saveMyProfile } from '../../services/sharing.js';
import Button from '../ui/Button.jsx';
import FieldError from '../ui/FieldError.jsx';

export const NAME_MAX = 40;

/**
 * Prénom affiché aux autres participants des séjours partagés (1 à 40
 * caractères), modifiable dans l'écran Compte et demandé au premier partage.
 * @param {{ onSaved?: (name: string) => void, autoFocus?: boolean }} props
 */
export default function ProfileNameForm({ onSaved, autoFocus = false }) {
  const { t } = useTranslation();
  const id = useId();
  const online = useOnlineStatus();
  const [name, setName] = useState('');
  const [color, setColor] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!online) return;
    myProfile()
      .then((p) => {
        if (p) {
          setName(p.displayName);
          setColor(p.avatarColor);
        }
      })
      .catch(() => {});
  }, [online]);

  const save = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > NAME_MAX) return setError(t('profile.nameInvalid', { max: NAME_MAX }));
    setError(null);
    setState('saving');
    try {
      await saveMyProfile(trimmed, color);
      setState('saved');
      onSaved?.(trimmed);
    } catch (err) {
      setState('idle');
      setError(t(err?.messageKey ?? 'errors.unknown'));
    }
  };

  return (
    <form noValidate onSubmit={save} className="space-y-2">
      <label htmlFor={id} className="block font-medium">
        {t('profile.nameLabel')}
      </label>
      <p className="text-sm text-ink-muted">{t('profile.nameHelp')}</p>
      <input
        id={id}
        type="text"
        autoComplete="given-name"
        maxLength={NAME_MAX}
        autoFocus={autoFocus}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setState('idle');
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <Button type="submit" variant="secondary" icon={Check} disabled={!online || state === 'saving'} className="w-full">
        {state === 'saved' ? t('profile.saved') : t('profile.save')}
      </Button>
      {!online && <p className="text-sm text-ink-muted">{t('profile.offline')}</p>}
    </form>
  );
}
