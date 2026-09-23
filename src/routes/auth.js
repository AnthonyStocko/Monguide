const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Comparé quand l'email est inconnu, pour que le temps de réponse ne révèle pas si le compte existe.
const DUMMY_HASH = bcrypt.hashSync('mot-de-passe-factice', 10);

const fail = (res, status, error, message) => res.status(status).json({ error, message });

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    if (!name || name.length > 100) return fail(res, 400, 'invalid_name', 'Prénom invalide.');
    if (!EMAIL_RE.test(email) || email.length > 255) {
      return fail(res, 400, 'invalid_email', 'Adresse email invalide.');
    }
    // bcrypt ignore tout après 72 octets : on borne la longueur pour éviter toute surprise.
    if (password.length < 8 || password.length > 72) {
      return fail(res, 400, 'weak_password', 'Le mot de passe doit faire de 8 à 72 caractères.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let insertId;
    try {
      ({ insertId } = await db.run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email, passwordHash]
      ));
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return fail(res, 409, 'email_taken', 'Un compte existe déjà avec cet email.');
      }
      throw e;
    }

    res.status(201).json({ token: signToken(insertId), user: { id: insertId, name, email } });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    const [user] = await db.rows(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?',
      [email]
    );
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return fail(res, 401, 'invalid_credentials', 'Email ou mot de passe incorrect.');
    }

    res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    next(e);
  }
});

// Suppression définitive du compte parent (exigée par Google Play). Publique
// mais protégée par email + mot de passe, pour servir aussi à la page web
// /suppression-compte. Les tables liées à users doivent être en ON DELETE CASCADE.
router.post('/delete-account', async (req, res, next) => {
  try {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    const [user] = await db.rows('SELECT id, password_hash FROM users WHERE email = ?', [email]);
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    // 403 et non 401 : côté client, un 401 déconnecte le parent (voir web/src/api/client.js).
    if (!user || !ok) {
      return fail(res, 403, 'invalid_credentials', 'Email ou mot de passe incorrect.');
    }

    await db.run('DELETE FROM users WHERE id = ?', [user.id]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
