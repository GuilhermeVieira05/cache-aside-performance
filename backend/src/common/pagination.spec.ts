import { parsePageParams, buildPaginated, pageCacheKey } from './pagination.js';

describe('parsePageParams', () => {
  it('usa defaults quando ausente', () => {
    expect(parsePageParams(undefined, undefined)).toEqual({ page: 1, pageSize: 50 });
  });
  it('faz clamp de valores inválidos', () => {
    expect(parsePageParams('0', '-5')).toEqual({ page: 1, pageSize: 50 });
    expect(parsePageParams('abc', 'xyz')).toEqual({ page: 1, pageSize: 50 });
  });
  it('limita pageSize ao teto de 200', () => {
    expect(parsePageParams('3', '1000')).toEqual({ page: 3, pageSize: 200 });
  });
});

describe('buildPaginated', () => {
  it('calcula totalPages (ceil) e ecoa params', () => {
    const r = buildPaginated([1, 2], 50000, { page: 2, pageSize: 50 });
    expect(r).toEqual({ data: [1, 2], total: 50000, page: 2, pageSize: 50, totalPages: 1000 });
  });
  it('totalPages mínimo 1 quando total = 0', () => {
    expect(buildPaginated([], 0, { page: 1, pageSize: 50 }).totalPages).toBe(1);
  });
});

describe('pageCacheKey', () => {
  it('monta a chave por página', () => {
    expect(pageCacheKey('orders', { page: 1, pageSize: 50 })).toBe('orders:page:1:size:50');
  });
});
