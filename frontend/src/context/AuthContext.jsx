// Sign-in that also works offline.
// After a successful online sign-in we keep a salted PBKDF2 hash of the password
// on the phone. With no connection, the same person can sign in again by
// checking against that hash. A new person can only sign in online.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken } from '../services/api.js';
import { db, clearLocalData } from '../offline/indexedDB.js';
import { syncEngine } from '../offline/syncEngine.js';
import { t } from '../i18n/index.jsx';

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
  throw new Error(t('This account is for: {role}. Choose "{tab}" above and sign in again.', { role: t(ROLE_NAMES[user.role]), tab: t(right?.[1].label) }));
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

  // Refresh the signed-in user's role and areas from the server (an admin may have
  // changed them, or they still hold codes from an older version). Offline: keep the copy.
  const token = session?.token;
  useEffect(() => {
    if (!token || session?.expired) return;
    api.me().then(({ user: fresh }) => {
      if (!fresh) return;
      setSession((cur) => {
        if (!cur || cur.token !== token) return cur;
        const user = { ...cur.user, ...fresh };
        if (JSON.stringify(user) === JSON.stringify(cur.user)) return cur;
        const next = { ...cur, user };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      });
    }).catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Start a session from a server reply. With a password, also keep an offline
  // verifier, under the name typed (email or username) and the account username.
  const startSession = async (res, tab, { password, typed, via } = {}) => {
    checkTab(res.user, tab);
    await prepareDevice(res.user.username);
    if (password) {
      const verifier = await hashPassword(password);
      if (verifier) {
        const saved = JSON.stringify({ ...verifier, user: res.user, token: res.token });
        for (const k of new Set([typed, res.user.username].filter(Boolean))) localStorage.setItem(credKey(k), saved);
      }
    }
    const s = { token: res.token, user: res.user, offline: false, ...(via ? { via } : {}) };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
    return s;
  };

  const login = useCallback(async (usernameRaw, password, tab) => {
    const username = usernameRaw.trim().toLowerCase();
    try {
      const res = await api.login(username, password);
      return await startSession(res, tab, { password, typed: username });
    } catch (err) {
      if (!err.offline) throw err;
      const saved = JSON.parse(localStorage.getItem(credKey(username)) || 'null');
      if (!saved) throw new Error('You are offline, and this account has not signed in on this phone before. Connect once to sign in.');
      const check = await hashPassword(password, saved.salt);
      if (!check || check.hash !== saved.hash) throw new Error('Email/username or password is incorrect.');
      checkTab(saved.user, tab);
      await prepareDevice(saved.user.username);
      const s = { token: saved.token, user: saved.user, offline: true };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      return s;
    }
  }, []);

  // Create an account (needs a connection). Returns { pending, message } when it must be approved first.
  const register = useCallback(async (form, tab) => {
    const res = await api.register({ ...form, tab });
    if (res.pending) return { pending: true, message: res.message };
    await startSession(res, tab, { password: form.password, typed: form.email.trim().toLowerCase() });
    return { pending: false };
  }, []);

  // Google sign-in needs a connection; afterwards the session works offline like any other.
  // `signup` ({ ward }) is sent from the "Create an account" screen so a new account can be made.
  const loginWithGoogle = useCallback(async (credential, tab, signup) => {
    const res = await api.googleLogin(credential, signup ? { ...signup, tab } : undefined);
    if (res.pending) return { pending: true, message: res.message };
    await startSession(res, tab, { via: 'google' });
    return { pending: false };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, user: session?.user || null, login, register, loginWithGoogle, logout }), [session, login, register, loginWithGoogle, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export const isStaff = (user) => user && (user.role === 'admin' || user.role === 'supervisor');
