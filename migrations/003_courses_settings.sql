-- migrate:up
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  current_semester INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO academic_settings (id, current_semester)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO courses (name)
VALUES
  ('Química'),
  ('Pedagogia'),
  ('Matemática'),
  ('Inglês'),
  ('Informática Aplicada'),
  ('História'),
  ('Física'),
  ('Ensino Básico'),
  ('Biologia'),
  ('AGE')
ON CONFLICT (name) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS academic_settings;
DROP TABLE IF EXISTS courses;
