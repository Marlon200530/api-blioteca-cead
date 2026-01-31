\connect cead_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cead_users (
  codigo TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

INSERT INTO cead_users (codigo, nome, password_hash) VALUES
  ('CEAD001', 'Ana Silva', crypt('Password123!', gen_salt('bf'))),
  ('CEAD002', 'Bruno Costa', crypt('Password123!', gen_salt('bf'))),
  ('CEAD003', 'Carla Mendes', crypt('Password123!', gen_salt('bf')))
ON CONFLICT (codigo) DO NOTHING;
