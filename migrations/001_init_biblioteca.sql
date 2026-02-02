-- migrate:up
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('USER', 'GESTOR_CONTEUDO', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('ATIVO', 'INATIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_kind') THEN
    CREATE TYPE material_kind AS ENUM ('MODULO', 'PUBLICACAO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_visibility') THEN
    CREATE TYPE material_visibility AS ENUM ('PUBLICO', 'PRIVADO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_status') THEN
    CREATE TYPE material_status AS ENUM ('ATIVO', 'INATIVO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_type') THEN
    CREATE TYPE material_type AS ENUM (
      'LIVRO',
      'ARTIGO_CIENTIFICO',
      'ARTIGO_REVISTA',
      'TEMA_TRANSVERSAL',
      'RELATORIO_TECNICO',
      'TESE',
      'DISSERTACAO',
      'OUTROS'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  password_hash_local TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  status user_status NOT NULL DEFAULT 'ATIVO',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  curso TEXT,
  ano INTEGER,
  semestre INTEGER,
  completed_profile BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  kind material_kind NOT NULL,
  visibility material_visibility NOT NULL DEFAULT 'PRIVADO',
  status material_status NOT NULL DEFAULT 'ATIVO',
  curso TEXT,
  ano INTEGER,
  semestre INTEGER,
  material_type material_type,
  autor TEXT,
  ano_publicacao INTEGER,
  capa_path TEXT,
  pdf_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, material_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  current_page INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, material_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS reading_progress;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS materials;
DROP TABLE IF EXISTS user_profile;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS material_type;
DROP TYPE IF EXISTS material_status;
DROP TYPE IF EXISTS material_visibility;
DROP TYPE IF EXISTS material_kind;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;

DROP EXTENSION IF EXISTS unaccent;
DROP EXTENSION IF EXISTS pgcrypto;
