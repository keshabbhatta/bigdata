import { createContext, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncEngine } from '../offline/syncEngine.js';
import { db } from '../offline/indexedDB.js';
import { getProfile, onProfileChange } from '../offline/networkSim.js';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [status, setStatus] = useState(syncEngine.status);
  const [network, setNetwork] = useState(getProfile());
  const [online, setOnline] = useState(navigator.onLine);
  const pending = useLiveQuery(() => db.outbox.where('status').equals('PENDING').count(), [], 0);
  const openConflicts = useLiveQuery(() => db.conflicts.where('status').equals('open').count(), [], 0);

  useEffect(() => syncEngine.subscribe(setStatus), []);
  useEffect(() => onProfileChange(setNetwork), []);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const value = {
    ...status,
    pending,
    openConflicts,
    network,
    isOffline: !online || network === 'offline' || status.state === 'offline',
    syncNow: () => syncEngine.sync(),
    schedule: (ms) => syncEngine.schedule(ms),
  };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}
