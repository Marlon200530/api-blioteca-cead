import { bibliotecaPool } from '../db/pool.js';

export type AuditAction =
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_RESET_PASSWORD'
  | 'USER_DELETE';

export async function logAudit(params: {
  userId: string;
  action: AuditAction;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await bibliotecaPool.query(
      `
      INSERT INTO audit_logs (user_id, action, target_id, metadata)
      VALUES ($1, $2, $3, $4)
      `,
      [params.userId, params.action, params.targetId ?? null, params.metadata ?? null]
    );
  } catch {
    // Ignore audit failures to avoid blocking main flow.
  }
}
