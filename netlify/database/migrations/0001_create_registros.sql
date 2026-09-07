CREATE TABLE IF NOT EXISTS registros (
  id BIGSERIAL PRIMARY KEY,
  folio TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  proceso TEXT NOT NULL CHECK (proceso IN ('H-2A', 'H-2B', 'TN')),
  etapa TEXT NOT NULL CHECK (etapa IN ('Registro', 'Evaluación', 'Preparación', 'Trámite', 'Traslado')),
  estado TEXT NOT NULL CHECK (estado IN ('En proceso', 'Documentación', 'Completado', 'Pendiente')),
  ultima_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mensaje TEXT NOT NULL DEFAULT '',
  pin_acceso TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS registros_folio_idx ON registros (folio);
