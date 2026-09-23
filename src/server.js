require('dotenv').config();
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET manquant ou trop court (32 caractères minimum). Voir .env.exemple.');
  process.exit(1);
}

const app = express();
// alwaysdata place un reverse proxy devant l'appli : nécessaire pour voir la vraie IP du client.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.get('/health', async (req, res) => {
  let database = true;
  try {
    await db.rows('SELECT 1');
  } catch {
    database = false;
  }
  res.status(database ? 200 : 503).json({ status: database ? 'OK' : 'DEGRADED', database });
});

// Limite les essais de connexion / création de compte (force brute)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Trop de tentatives, réessaie dans quelques minutes.' }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/me', meRoutes);

// En prod, cette même appli sert aussi le client React buildé (voir web/) : un seul
// serveur à déployer. En dev, le client tourne à part via `npm run dev` dans web/ (Vite).
const webDist = path.join(__dirname, '..', 'web', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(webDist));
}

app.use((req, res) => {
  if (process.env.NODE_ENV === 'production' && req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(webDist, 'index.html'));
  }
  res.status(404).json({ error: 'not_found', message: 'Route introuvable.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json', message: 'Corps de requête invalide.' });
  }
  console.error('Erreur :', err);
  res.status(500).json({ error: 'server_error', message: 'Erreur interne du serveur.' });
});

db.initSchema()
  .then(() => console.log('📋 Tables MySQL prêtes'))
  .catch((err) => console.error('❌ Initialisation MySQL impossible :', err.message));

// alwaysdata fournit l'adresse (IP) et le port d'écoute via les variables d'environnement.
const PORT = process.env.PORT || 3000;
const HOST = process.env.IP || '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`🚀 Mon guide API sur ${HOST}:${PORT}`));
