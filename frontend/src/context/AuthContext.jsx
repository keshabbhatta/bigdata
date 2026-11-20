// Sign-in that also works offline.
// After a successful online sign-in we keep a salted PBKDF2 hash of the password
// on the phone. With no connection, the same person can sign in again by
// checking against that hash. A new person can only sign in online.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken } from '../services/api.js';
import { db, clearLocalData } from '../offline/indexedDB.js';
import { syncEngine } from '../offline/syncEngine.js';

const AuthContext = createContext(null);

// Which account roles each sign-in tab accepts.
export const ROLE_TABS = {
  worker: { label: 'Health worker', roles: ['worker'] },
  doctor: { label: 'Doctor', roles: ['supervisor', 'admin'] },
  patient: { label: 'Patient', roles: ['patient'] },
};
export const ROLE_NAMES = { worker: 'Health volunteer', supervisor: 'Doctor / supervisor', admin: 'Administrator', patient: 'Patient' };

function checkTab(user, tab) {
  if (!tab || ROLE_TABS[tab].roles.includes(user.role)) return;
  const right = Object.entries(ROLE_TABS).find(([, t]) => t.roles.includes(user.role));
  throw new Error(`This is a ${ROLE_NAMES[user.role].toLowerCase()} account. Choose "${right?.[1].label}" above and sign in again.`);
}
const SESSION_KEY = 'rh.session';
const credKey = (u) => `rh.cred.${u}`;

async function hashPassword(password, saltB64) {
  if (!crypto?.subtle) return null;
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, key, 256);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { salt: b64(salt), hash: b64(bits) };
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);

  useEffect(() => {
    setToken(session?.token || null);
    if (session) syncEngine.start();
    else syncEngine.stop();
  }, [session]);

  // When the server says the token expired, ask for sign-in but keep all local data.
  useEffect(() => syncEngine.subscribe((s) => {
    if (s.state === 'auth') setSession((cur) => (cur ? { ...cur, expired: true } : cur));
  }), []);

  const prepareDevice = async (username) => {
    const last = localStorage.getItem('rh.lastUser');
    if (last && last !== username) {
      const pending = await db.outbox.where('status').equals('PENDING').count();
      if (pending > 0) {
        throw new Error(`${pending} changes by ${last} have not synced yet. Connect to the internet and sync before another person signs in on this phone.`);
      }
      await clearLocalData();
    }
    localStorage.setItem('rh.lastUser', username);
  };

  const login = useCallback(async (usernameRaw, password, tab) => {
    const username = usernameRaw.trim().toLowerCase();
    try {
      const res = await api.login(username, password);
      checkTab(res.user, tab);
      await prepareDevice(username);
      const verifier = await hashPassword(password);
      if (verifier) localStorage.setItem(credKey(username), JSON.stringify({ ...verifier, user: res.user, token: res.token }));
      const s = { token: res.token, user: res.user, offline: false };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      return s;
    } catch (err) {
      if (!err.offline) throw err;
      const saved = JSON.parse(localStorage.getItem(credKey(username)) || 'null');
      if (!saved) throw new Error('You are offline, and this account has not signed in on this phone before. Connect once to sign in.');
      const check = await hashPassword(password, saved.salt);
      if (!check || check.hash !== saved.hash) throw new Error('Username or password is incorrect.');
      checkTab(saved.user, tab);
      await prepareDevice(username);
      const s = { token: saved.token, user: saved.user, offline: true };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      return s;
    }
  }, []);

  // Google sign-in needs a connection; afterwards the session works offline like any other.
  const loginWithGoogle = useCallback(async (credential, tab) => {
    const res = await api.googleLogin(credential);
    checkTab(res.user, tab);
    await prepareDevice(res.user.username);
    const s = { token: res.token, user: res.user, offline: false, via: 'google' };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, user: session?.user || null, login, loginWithGoogle, logout }), [session, login, loginWithGoogle, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const isStaff = (user) => user && (user.role === 'admin' || user.role === 'supervisor');
