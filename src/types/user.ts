export type UserRole = 'USER' | 'GESTOR_CONTEUDO' | 'ADMIN';
export type UserStatus = 'ATIVO' | 'INATIVO';

export type AuthUser = {
  id: string;
  codigo: string;
  nome: string;
  role: UserRole;
  status: UserStatus;
  must_change_password?: boolean;
  curso: string | null;
  ano: number | null;
  semestre: number | null;
  completed_profile: boolean | null;
};
