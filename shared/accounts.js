// Account rules shared by the sign-up form (instant feedback) and the server
// (where they are enforced). Keep both sides in agreement by changing them here.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes

export function passwordChecks(pw = '') {
  return [
    { ok: pw.length >= PASSWORD_MIN, label: `At least ${PASSWORD_MIN} characters` },
    { ok: /[a-z]/.test(pw), label: 'A lowercase letter' },
    { ok: /[A-Z]/.test(pw), label: 'An uppercase letter' },
    { ok: /\d/.test(pw), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'A symbol, for example ! @ # $' },
  ];
}

export function passwordProblems(pw = '') {
  if (typeof pw !== 'string') return ['Enter a password.'];
  if (pw.length > PASSWORD_MAX) return [`Password must be at most ${PASSWORD_MAX} characters.`];
  const missing = passwordChecks(pw).filter((c) => !c.ok).map((c) => c.label.toLowerCase());
  return missing.length ? [`Password needs ${missing.join(', ')}.`] : [];
}

export const normalizeEmail = (e = '') => String(e).trim().toLowerCase();

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Shape check only. The server also checks that the domain can receive mail. */
export function isEmailFormat(email) {
  const e = normalizeEmail(email);
  const [local = ''] = e.split('@');
  return e.length <= 254 && local.length <= 64 && EMAIL_RE.test(e)
    && !e.includes('..') && !local.startsWith('.') && !local.endsWith('.') && /\.[a-z]{2,}$/.test(e);
}
