module CacheService
  TTL = ENV.fetch("CACHE_TTL_SECONDS", 300).to_i.seconds

  def self.fetch(key, ttl: TTL)
    return yield unless enabled?

    cached = Rails.cache.read(key)
    unless cached.nil?
      Rails.logger.info("[CACHE HIT] key=#{key}")
      return cached
    end
    Rails.logger.info("[CACHE MISS] key=#{key}")
    value = yield
    Rails.cache.write(key, value, expires_in: ttl)
    value
  end

  def self.invalidate(*keys)
    return unless enabled?

    keys.each do |key|
      Rails.cache.delete(key)
      Rails.logger.info("[CACHE INVALIDATE] key=#{key}")
    end
  end

  def self.enabled?
    ENV.fetch("CACHE_ENABLED", "true") == "true"
  end
end
