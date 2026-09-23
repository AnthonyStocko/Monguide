const jwt = require('jsonwebtoken');

const TOKEN_LIFETIME = '30d';

function signToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(userId),
    expiresIn: TOKEN_LIFETIME
  });
}

/** Exige un en-tête "Authorization: Bearer <jeton>" valide ; renseigne req.userId. */
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Connexion requise.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Session expirée, reconnecte-toi.' });
  }
}

module.exports = { signToken, requireAuth };
