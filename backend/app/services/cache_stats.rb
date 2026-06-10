module CacheStats
  HASH_KEY = "cache_stats"

  def self.redis
    @redis ||= Redis.new(url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1"))
  end

  def self.incr(field, by = 1)
    redis.hincrby(HASH_KEY, field, by)
  rescue => e
    Rails.logger.warn("[CacheStats] incr failed: #{e.message}")
  end

  def self.all
    raw = redis.hgetall(HASH_KEY)
    hits   = raw.fetch("hits",          "0").to_i
    misses = raw.fetch("misses",         "0").to_i
    total  = hits + misses
    {
      hits:         hits,
      misses:       misses,
      hit_rate:     total.zero? ? 0.0 : (hits.to_f / total * 100).round(2),
      invalidations: raw.fetch("invalidations", "0").to_i,
      db_queries:   raw.fetch("db_queries",    "0").to_i
    }
  rescue => e
    Rails.logger.warn("[CacheStats] all failed: #{e.message}")
    { hits: 0, misses: 0, hit_rate: 0.0, invalidations: 0, db_queries: 0 }
  end

  def self.reset
    redis.del(HASH_KEY)
  rescue => e
    Rails.logger.warn("[CacheStats] reset failed: #{e.message}")
  end
end
