import { useState } from 'react';
import { useConflicts } from '../hooks/useRecords.js';
import { useAuth, isStaff } from '../context/AuthContext.jsx';
import { ConflictCard } from '../components/ConflictCard.jsx';
import { Empty, PageHead, Panel, Segmented } from '../components/ui.jsx';
import { t } from '../i18n/index.jsx';

export function Conflicts() {
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const conflicts = useConflicts(status);

  return (
    <>
      <PageHead
        title={t('Conflicting readings')}
        subtitle={isStaff(user)
          ? t('Two health workers recorded different clinical values for the same patient while offline. Both readings are kept. Choose the correct one or enter a new measurement.')
          : t('When two workers record different clinical values for the same patient while offline, both readings are kept here until a supervisor reviews them.')}
      >
        <Segmented label={t('Show')} value={status} onChange={setStatus} options={[{ value: 'open', label: t('Needs review') }, { value: 'resolved', label: t('Resolved') }]} />
      </PageHead>

      {conflicts && conflicts.length === 0 ? (
        <Panel>
          <Empty title={status === 'open' ? t('No conflicting readings') : t('No resolved conflicts on this phone')}>
            {status === 'open'
              ? t('If two phones change the same blood pressure, hemoglobin or risk level while offline, it appears here after both sync.')
              : t('Resolved conflicts appear here after the next sync.')}
          </Empty>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {(conflicts || []).map((c) => <ConflictCard key={c.id} conflict={c} />)}
        </div>
      )}
    </>
  );
}
