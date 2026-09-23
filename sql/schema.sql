-- Schema MySQL de Mon guide.
-- L'API l'execute automatiquement au demarrage (CREATE TABLE IF NOT EXISTS),
-- mais tu peux aussi l'importer a la main dans phpMyAdmin (alwaysdata).
-- Toute table liée à un utilisateur doit référencer users(id) en ON DELETE CASCADE,
-- pour que la suppression de compte (POST /api/auth/delete-account) efface tout.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
