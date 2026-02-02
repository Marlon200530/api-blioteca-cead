import { Router } from 'express';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/response.js';

const router = Router();

router.get(
  '/courses',
  asyncHandler(async (_req, res) => {
    const { rows } = await bibliotecaPool.query<{ name: string }>(
      `SELECT name FROM courses WHERE active = true ORDER BY name`
    );
    res.json(ok(rows.map((r) => r.name)));
  })
);

router.get(
  '/academic',
  asyncHandler(async (_req, res) => {
    const { rows } = await bibliotecaPool.query<{ current_semester: number }>(
      `SELECT current_semester FROM academic_settings WHERE id = 1`
    );
    if (!rows[0]) {
      await bibliotecaPool.query(
        `INSERT INTO academic_settings (id, current_semester) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`
      );
      res.json(ok({ currentSemester: 1 }));
      return;
    }
    res.json(ok({ currentSemester: rows[0].current_semester }));
  })
);

router.get(
  '/years',
  asyncHandler(async (_req, res) => {
    const { rows } = await bibliotecaPool.query<{ max: number }>(
      `SELECT COALESCE(MAX(duration_years), 4)::int AS max FROM courses`
    );
    const maxYears = rows[0]?.max ?? 4;
    const years = Array.from({ length: Math.max(1, maxYears) }, (_, i) => i + 1);
    res.json(ok(years));
  })
);

router.get('/semesters', (_req, res) => {
  res.json(ok([1, 2]));
});

router.get('/material-types', (_req, res) => {
  res.json(
    ok([
      'LIVRO',
      'ARTIGO_CIENTIFICO',
      'ARTIGO_REVISTA',
      'MANUAL',
      'TEMA_TRANSVERSAL',
      'RELATORIO_TECNICO',
      'TESE',
      'DISSERTACAO',
      'OUTROS'
    ])
  );
});

export default router;
