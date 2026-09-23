const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Profil de l'utilisateur connecté
router.get('/', async (req, res, next) => {
  try {
    const [user] = await db.rows('SELECT id, name, email FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Compte introuvable.' });
    }
    res.json(user);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
