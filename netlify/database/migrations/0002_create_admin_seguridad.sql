-- Sesiones del panel de administración. Solo se guarda el hash SHA-256 del token;
-- el token real vive únicamente en la cookie HttpOnly del navegador.
CREATE TABLE IF NOT EXISTS admin_sesiones (
  token_hash TEXT PRIMARY KEY,
  expira_en TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_sesiones_expira_idx ON admin_sesiones (expira_en);

-- Control de intentos fallidos (inicio de sesión y consulta pública).
-- La clave es un hash, nunca la IP ni el folio en texto plano.
CREATE TABLE IF NOT EXISTS intentos_fallidos (
  clave TEXT PRIMARY KEY,
  fallos INTEGER NOT NULL DEFAULT 0,
  ventana_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_hasta TIMESTAMPTZ
);
