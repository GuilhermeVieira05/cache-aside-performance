import { CacheStatsService } from './cache-stats.service.js';

function fakeRedis(hash: Record<string, string>) {
  return {
    hgetall: jest.fn(async () => hash),
    hincrby: jest.fn(async (_k: string, f: string, by: number) => {
      hash[f] = String((parseInt(hash[f] ?? '0', 10)) + by);
    }),
    hincrbyfloat: jest.fn(async (_k: string, f: string, by: number) => {
      hash[f] = String((parseFloat(hash[f] ?? '0')) + by);
    }),
    del: jest.fn(async () => 1),
  } as any;
}

describe('CacheStatsService.all', () => {
  it('calcula hit_rate e médias por categoria', async () => {
    const redis = fakeRedis({
      hits: '3', misses: '1', invalidations: '2', db_queries: '1',
      sum_ms_hit: '6', cnt_hit: '3',
      sum_ms_miss: '40', cnt_miss: '1',
      sum_ms_nocache: '0', cnt_nocache: '0',
    });
    const svc = new CacheStatsService(redis);
    const dto = await svc.all();
    expect(dto.hits).toBe(3);
    expect(dto.misses).toBe(1);
    expect(dto.hit_rate).toBe(75);
    expect(dto.db_queries).toBe(1);
    expect(dto.avg_ms_hit).toBe(2);
    expect(dto.avg_ms_miss).toBe(40);
    expect(dto.avg_ms_nocache).toBe(0);
  });
});

describe('CacheStatsService.recordTiming', () => {
  it('soma duração (float) e conta (int) por categoria', async () => {
    const hash: Record<string, string> = {};
    const redis = fakeRedis(hash);
    const svc = new CacheStatsService(redis);
    await svc.recordTiming('hit', 1.5);
    await svc.recordTiming('hit', 2.5);
    expect(redis.hincrbyfloat).toHaveBeenCalledWith('cache_stats', 'sum_ms_hit', 1.5);
    expect(hash['sum_ms_hit']).toBe('4');
    expect(hash['cnt_hit']).toBe('2');
  });
});
