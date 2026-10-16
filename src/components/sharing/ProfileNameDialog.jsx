import { useTranslation } from 'react-i18next';
import Dialog from '../ui/Dialog.jsx';
import ProfileNameForm from './ProfileNameForm.jsx';

/** Premier partage : prénom à afficher aux autres participants, demandé une fois. */
export default function ProfileNameDialog({ onDone, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('profile.askTitle')} onClose={onClose}>
      <div className="space-y-3">
        <p>{t('profile.askText')}</p>
        <ProfileNameForm autoFocus onSaved={onDone} />
      </div>
    </Dialog>
  );
}
