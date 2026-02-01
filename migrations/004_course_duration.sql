-- migrate:up
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS duration_years INTEGER NOT NULL DEFAULT 4;

UPDATE courses
SET duration_years = 4
WHERE duration_years IS NULL;

-- migrate:down
ALTER TABLE courses
DROP COLUMN IF EXISTS duration_years;
