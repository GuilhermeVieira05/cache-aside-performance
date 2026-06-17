import { CacheService } from './cache.service.js';

function makeStats() {
  return {
    incr: jest.fn(async () => {}),
    recordTiming: jest.fn(async () => {}),
  };
}

describe('CacheService.fetch timing/contadores', () => {
  it('HIT: registra hit + recordTiming(hit) e não chama loader', async () => {
    const redis = { get: jest.fn(async () => JSON.stringify({ a: 1 })), set: jest.fn() } as any;
    const stats = makeStats();
    const svc = new CacheService(redis, stats as any);
    const loader = jest.fn(async () => ({ a: 2 }));
    const [val, status] = await svc.fetch('k', 60, loader);
    expect(status).toBe('HIT');
    expect(val).toEqual({ a: 1 });
    expect(loader).not.toHaveBeenCalled();
    expect(stats.incr).toHaveBeenCalledWith('hits');
    expect(stats.recordTiming).toHaveBeenCalledWith('hit', expect.any(Number));
  });

  it('MISS: registra misses + db_queries + recordTiming(miss) e grava no Redis', async () => {
    const redis = { get: jest.fn(async () => null), set: jest.fn(async () => 'OK') } as any;
    const stats = makeStats();
    const svc = new CacheService(redis, stats as any);
    const [, status] = await svc.fetch('k', 60, async () => ({ a: 2 }));
    expect(status).toBe('MISS');
    expect(stats.incr).toHaveBeenCalledWith('misses');
    expect(stats.incr).toHaveBeenCalledWith('db_queries');
    expect(stats.recordTiming).toHaveBeenCalledWith('miss', expect.any(Number));
    expect(redis.set).toHaveBeenCalled();
  });

  it('DISABLED: registra db_queries + recordTiming(nocache)', async () => {
    const redis = { get: jest.fn(), set: jest.fn() } as any;
    const stats = makeStats();
    const svc = new CacheService(redis, stats as any);
    svc.toggle();
    const [, status] = await svc.fetch('k', 60, async () => ({ a: 2 }));
    expect(status).toBe('DISABLED');
    expect(stats.incr).toHaveBeenCalledWith('db_queries');
    expect(stats.recordTiming).toHaveBeenCalledWith('nocache', expect.any(Number));
    expect(redis.get).not.toHaveBeenCalled();
  });
});

describe('CacheService.invalidatePattern', () => {
  it('faz SCAN e DEL de todas as chaves do padrão e conta invalidações', async () => {
    const scan = jest.fn()
      .mockResolvedValueOnce(['10', ['products:page:1:size:50']])
      .mockResolvedValueOnce(['0', ['products:page:2:size:50']]);
    const redis = { scan, del: jest.fn(async () => 1) } as any;
    const stats = makeStats();
    const svc = new CacheService(redis, stats as any);
    const n = await svc.invalidatePattern('products:page:*');
    expect(n).toBe(2);
    expect(redis.del).toHaveBeenCalledTimes(2);
    expect(stats.incr).toHaveBeenCalledWith('invalidations', 2);
  });
});
