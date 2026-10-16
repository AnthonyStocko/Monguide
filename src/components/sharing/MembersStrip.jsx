import { useTranslation } from 'react-i18next';
import Avatar from './Avatar.jsx';

const SHOWN = 4;

/** « Anthony, Paul et 2 autres » : prénoms des participants (jamais la couleur seule). */
export function membersLabel(members, t) {
  const names = members.map((m) => m.name ?? t('changes.someone'));
  if (names.length <= SHOWN) return t('sharing.namesList', { names: names.slice(0, -1).join(', '), last: names.at(-1), count: names.length });
  return t('sharing.namesMore', { names: names.slice(0, SHOWN - 1).join(', '), count: names.length - (SHOWN - 1) });
}

/**
 * Participants d'un séjour partagé : pastilles et prénoms ; appui : écran
 * « Participants ».
 * @param {{ members: import('../../services/sharing.js').CachedMember[], onOpen: () => void }} props
 */
export default function MembersStrip({ members, onOpen }) {
  const { t } = useTranslation();
  const label = membersLabel(members, t);
  return (
    <button type="button" onClick={onOpen} aria-label={t('sharing.membersButton', { names: label })} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-subtle">
      <span className="flex -space-x-2">
        {members.slice(0, SHOWN).map((m) => (
          <Avatar key={m.userId} name={m.name} color={m.color} userId={m.userId} size="sm" />
        ))}
      </span>
      <span className="min-w-0 flex-1 text-base">{label}</span>
    </button>
  );
}
