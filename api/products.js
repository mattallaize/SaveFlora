// ═══════════════════════════════════════════════════════
// MIDDLEWARE DE SÉCURITÉ — saveflora.fr
// Utilisé par toutes les fonctions API
// ═══════════════════════════════════════════════════════

// Rate limiting en mémoire (par IP, reset toutes les 60s)
const rateLimitStore = new Map();

/**
 * Vérifie le rate limit pour une IP donnée
 * @param {string} ip - L'IP du client
 * @param {number} maxRequests - Nombre max de requêtes autorisées
 * @param {number} windowMs - Fenêtre de temps en ms (défaut: 60s)
 * @returns {boolean} true si OK, false si bloqué
 */
function checkRateLimit(ip, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  const key = ip;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  const entry = rateLimitStore.get(key);

  // Reset si la fenêtre est expirée
  if (now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Incrémenter le compteur
  entry.count++;
  if (entry.count > maxRequests) {
    return false; // Bloqué
  }

  return true;
}

/**
 * Nettoyage périodique du store (évite les fuites mémoire)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000); // Nettoyage toutes les 5 minutes

/**
 * Récupère l'IP réelle du client (Vercel forwarde via x-forwarded-for)
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Valide la taille et le format du body
 * @param {object} body - Le body de la requête
 * @param {number} maxSizeKb - Taille max en Ko (défaut: 500Ko)
 * @returns {boolean}
 */
function validateBodySize(body, maxSizeKb = 500) {
  try {
    const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
    return size <= maxSizeKb * 1024;
  } catch {
    return false;
  }
}

/**
 * Headers de sécurité standards à ajouter à chaque réponse
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

module.exports = { checkRateLimit, getClientIp, validateBodySize, setSecurityHeaders };
