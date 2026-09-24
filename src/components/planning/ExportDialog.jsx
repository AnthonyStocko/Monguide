import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { exportTripPdf } from '../../services/pdf/exportTrip.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * Export PDF d'un séjour : option "Inclure les adresses personnelles"
 * (décochée par défaut), puis téléchargement (web) ou partage (mobile).
 * @param {{ trip: object, onClose: () => void }} props
 */
export default function ExportDialog({ trip, onClose }) {
  const { t } = useTranslation();
  const [includeAddresses, setIncludeAddresses] = useState(false);
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    setState({ status: 'loading' });
    try {
      const { fileName } = await exportTripPdf(trip, { includeAddresses });
      setState({ status: 'done', fileName });
    } catch {
      setState({ status: 'error' });
    }
  };

  return (
    <Dialog
      title={t('export.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button icon={FileDown} onClick={run} disabled={state.status === 'loading'}>
            {t('export.confirm')}
          </Button>
        </>
      }
    >
      <p>{t('export.intro')}</p>
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input type="checkbox" checked={includeAddresses} onChange={(e) => setIncludeAddresses(e.target.checked)} aria-describedby="export-addresses-hint" className="mt-3 size-6 shrink-0 accent-primary-strong" />
        <span>
          <span className="block font-medium leading-[3rem]">{t('export.includeAddresses')}</span>
          <span id="export-addresses-hint" className="block text-ink-muted">
            {t('export.includeAddressesHint')}
          </span>
        </span>
      </label>
      <div role="status" aria-live="polite">
        {state.status === 'loading' && <p className="text-ink-muted">{t('export.loading')}</p>}
        {state.status === 'done' && <p className="font-medium">{t('export.done', { fileName: state.fileName })}</p>}
        {state.status === 'error' && <p className="font-medium text-danger-on-soft">{t('export.failed')}</p>}
      </div>
    </Dialog>
  );
}
