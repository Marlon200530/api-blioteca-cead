ALTER TABLE materials
ADD COLUMN IF NOT EXISTS cursos text[];

UPDATE materials
SET cursos = ARRAY[curso]
WHERE kind = 'MODULO' AND curso IS NOT NULL AND (cursos IS NULL OR array_length(cursos, 1) IS NULL);
