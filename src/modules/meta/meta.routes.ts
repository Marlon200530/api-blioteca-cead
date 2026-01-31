import { Router } from 'express';
import { ok } from '../../utils/response.js';

const router = Router();

router.get('/courses', (_req, res) => {
  res.json(ok(['Engenharia Informática', 'Gestão', 'Direito', 'Psicologia']));
});

router.get('/years', (_req, res) => {
  res.json(ok([1, 2, 3, 4]));
});

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
      'APOSTILA',
      'RELATORIO_TECNICO',
      'TESE',
      'DISSERTACAO',
      'OUTROS'
    ])
  );
});

export default router;
