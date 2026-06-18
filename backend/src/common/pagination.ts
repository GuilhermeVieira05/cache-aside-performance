export interface PageParams {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function parsePageParams(page?: string, pageSize?: string): PageParams {
  let p = parseInt(page ?? '', 10);
  let s = parseInt(pageSize ?? '', 10);
  if (!Number.isFinite(p) || p < 1) p = 1;
  if (!Number.isFinite(s) || s < 1) s = DEFAULT_PAGE_SIZE;
  if (s > MAX_PAGE_SIZE) s = MAX_PAGE_SIZE;
  return { page: p, pageSize: s };
}

export function buildPaginated<T>(data: T[], total: number, params: PageParams): Paginated<T> {
  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export function pageCacheKey(resource: string, params: PageParams): string {
  return `${resource}:page:${params.page}:size:${params.pageSize}`;
}
