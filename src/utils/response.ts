export const ok = <T>(data: T) => ({ data, message: 'ok' });

export const okList = <T>(data: T[], meta: { page: number; limit: number; total: number }) => ({
  data,
  meta,
  message: 'ok'
});
