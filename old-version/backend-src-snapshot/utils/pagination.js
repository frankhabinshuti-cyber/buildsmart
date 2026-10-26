export function parsePage(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}
export const pageMeta = (page, limit, total) => ({
  page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
});
