module CacheService
  TTL = ENV.fetch("CACHE_TTL_SECONDS", 300).to_i.seconds
  @override_enabled = nil

  def self.fetch(key, ttl: TTL)
    unless enabled?
      return [yield, :disabled]
    end

    cached = Rails.cache.read(key)
    unless cached.nil?
      Rails.logger.info("[CACHE HIT] key=#{key}")
      CacheStats.incr("hits")
      return [cached, :hit]
    end

    Rails.logger.info("[CACHE MISS] key=#{key}")
    CacheStats.incr("misses")
    value = yield
    Rails.cache.write(key, value, expires_in: ttl)
    [value, :miss]
  end

  def self.invalidate(*keys)
    return unless enabled?

    keys.each do |key|
      Rails.cache.delete(key)
      Rails.logger.info("[CACHE INVALIDATE] key=#{key}")
    end
    CacheStats.incr("invalidations", keys.size)
  end

  def self.enabled?
    return @override_enabled unless @override_enabled.nil?
    ENV.fetch("CACHE_ENABLED", "true") == "true"
  end

  def self.toggle!
    @override_enabled = !enabled?
  end
end
