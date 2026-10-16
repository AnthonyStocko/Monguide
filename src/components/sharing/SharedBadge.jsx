import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTripMembers } from '../../hooks/useTripMembers.js';
import Badge from '../ui/Badge.jsx';
import Avatar from './Avatar.jsx';
import { membersLabel } from './MembersStrip.jsx';

/** Liste des séjours : badge « Partagé », pastilles et prénoms des participants (séjour à plusieurs). */
export default function SharedBadge({ tripId }) {
  const { t } = useTranslation();
  const members = useTripMembers(tripId);
  if (!members || members.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="secondary" icon={Users}>
        {t('sharing.sharedBadge')}
      </Badge>
      <span className="flex -space-x-2">
        {members.slice(0, 4).map((m) => (
          <Avatar key={m.userId} name={m.name} color={m.color} userId={m.userId} size="sm" />
        ))}
      </span>
      <span className="text-base">{membersLabel(members, t)}</span>
    </div>
  );
}
