import { AuthUser } from '../types/user.js';

export const canAccessMaterial = (user: AuthUser, material: any) => {
  if (user.role === 'ADMIN' || user.role === 'GESTOR_CONTEUDO') return true;
  if (material.status !== 'ATIVO') return false;
  if (material.kind === 'MODULO') return true;

  if (material.kind === 'PUBLICACAO' && material.visibility === 'PUBLICO') return true;

  if (material.kind === 'PUBLICACAO' && material.visibility === 'PRIVADO') {
    if (!material.curso || !user.curso) return false;
    return material.curso === user.curso;
  }

  return false;
};
