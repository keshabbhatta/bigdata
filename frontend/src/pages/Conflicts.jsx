import { useState } from 'react';
import { useConflicts } from '../hooks/useRecords.js';
import { useAuth, isStaff } from '../context/AuthContext.jsx';
import { ConflictCard } from '../components/ConflictCard.jsx';
import { Empty, PageHead, Panel, Segmented } from '../components/ui.jsx';

export function Conflicts() {
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const conflicts = useConflicts(status);

  return (
    <>
      <PageHead
        title="Conflicting readings"
        subtitle={isStaff(user)
          ? 'Two health workers recorded different clinical values for the same patient while offline. Both readings are kept. Choose the correct one or enter a new measurement.'
          : 'When two workers record different clinical values for the same patient while offline, both readings are kept here until a supervisor reviews them.'}
      >
        <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Needs review' }, { value: 'resolved', label: 'Resolved' }]} />
      </PageHead>

      {conflicts && conflicts.length === 0 ? (
        <Panel>
          <Empty title={status === 'open' ? 'No conflicting readings' : 'No resolved conflicts on this phone'}>
            {status === 'open'
              ? 'If two phones change the same blood pressure, hemoglobin or risk level while offline, it appears here after both sync.'
              : 'Resolved conflicts appear here after the next sync.'}
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
