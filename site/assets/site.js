// Pages publiques de Mon guide : contact de l'équipe (fonction config) et
// suppression de compte depuis un navigateur (même connexion par code e-mail
// que l'application, puis fonction delete-account). Seules l'URL du projet
// et la clé publique Supabase sont utilisées (config.js, généré au
// déploiement depuis les secrets GitHub) : jamais la clé service_role.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm';
import { MONGUIDE } from '../config.js';

const API_VERSION = '1';
const $ = (id) => document.getElementById(id);
const texts = JSON.parse($('texts').textContent);
const headers = (token) => ({
  apikey: MONGUIDE.anonKey,
  Authorization: `Bearer ${token ?? MONGUIDE.anonKey}`,
  'x-monguide-api': API_VERSION,
  'x-monguide-app': MONGUIDE.appVersion,
  'Content-Type': 'application/json'
});

/** Contact de l'équipe (secret MONGUIDE_CONTACT, renvoyé par la fonction config). */
async function showContact() {
  const slots = document.querySelectorAll('[data-contact]');
  if (!slots.length) return;
  try {
    const res = await fetch(`${MONGUIDE.url}/functions/v1/config`, { headers: headers() });
    const { contact } = await res.json();
    if (!contact) throw new Error('no contact');
    for (const slot of slots) {
      const a = document.createElement('a');
      a.href = contact.includes('@') ? `mailto:${contact}` : contact;
      a.textContent = contact;
      slot.replaceChildren(a);
    }
  } catch {
    for (const slot of slots) slot.textContent = texts.contactUnavailable;
  }
}

function deletionFlow() {
  const form = $('delete-flow');
  if (!form) return;
  const supabase = createClient(MONGUIDE.url, MONGUIDE.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const status = $('status');
  let email = '';
  const say = (text, kind = 'ok') => {
    status.hidden = false;
    status.className = `message ${kind}`;
    status.textContent = text;
    status.focus();
  };
  const step = (id) => {
    for (const s of ['step-email', 'step-code', 'step-confirm', 'step-done']) $(s).hidden = s !== id;
  };
  const busy = (button, on) => {
    button.disabled = on;
  };

  $('send-code').addEventListener('click', async () => {
    email = $('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(texts.emailInvalid, 'error');
    busy($('send-code'), true);
    // shouldCreateUser: false : cette page ne crée jamais de compte.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    busy($('send-code'), false);
    // Même réponse qu'il existe un compte ou non (on ne révèle pas quelles adresses ont un compte).
    const noAccount = ['otp_disabled', 'user_not_found', 'signup_disabled'].includes(error?.code);
    if (error && !noAccount) return say(error.code === 'over_email_send_rate_limit' ? texts.tooManyEmails : texts.sendFailed, 'error');
    step('step-code');
    say(texts.codeSent.replace('{email}', email));
    $('code').focus();
  });

  $('verify-code').addEventListener('click', async () => {
    const token = $('code').value.replace(/\D/g, '');
    if (token.length < 6) return say(texts.codeFormat, 'error');
    busy($('verify-code'), true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    busy($('verify-code'), false);
    if (error || !data.session) return say(texts.codeInvalid, 'error');
    step('step-confirm');
    say(texts.signedIn.replace('{email}', email));
  });

  $('confirm').addEventListener('change', () => {
    $('delete').disabled = !$('confirm').checked;
  });

  $('delete').addEventListener('click', async () => {
    busy($('delete'), true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${MONGUIDE.url}/functions/v1/delete-account`, { method: 'POST', headers: headers(data.session?.access_token), body: '{}' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      step('step-done');
      say(texts.deleted);
    } catch {
      busy($('delete'), false);
      say(texts.deleteFailed, 'error');
    }
  });

  $('restart').addEventListener('click', () => {
    step('step-email');
    status.hidden = true;
  });
}

showContact();
deletionFlow();
