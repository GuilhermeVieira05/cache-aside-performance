require "test_helper"

class CacheServiceTest < ActiveSupport::TestCase
  setup do
    CacheService.instance_variable_set(:@override_enabled, nil)
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    Rails.cache.clear
  end

  teardown do
    Rails.cache = @original_cache
  end

  test "fetch retorna [value, :miss] no primeiro acesso" do
    value, status = CacheService.fetch("test:miss") { "resultado" }
    assert_equal "resultado", value
    assert_equal :miss, status
  end

  test "fetch retorna [value, :hit] no segundo acesso" do
    CacheService.fetch("test:hit") { "resultado" }
    value, status = CacheService.fetch("test:hit") { "outro" }
    assert_equal "resultado", value
    assert_equal :hit, status
  end

  test "fetch retorna [value, :disabled] quando cache desativado" do
    CacheService.instance_variable_set(:@override_enabled, false)
    value, status = CacheService.fetch("test:disabled") { "resultado" }
    assert_equal "resultado", value
    assert_equal :disabled, status
  end

  test "toggle! inverte o estado enabled" do
    CacheService.instance_variable_set(:@override_enabled, true)
    CacheService.toggle!
    assert_equal false, CacheService.enabled?
    CacheService.toggle!
    assert_equal true, CacheService.enabled?
  end

  test "enabled? respeita @override_enabled sobre env var" do
    CacheService.instance_variable_set(:@override_enabled, false)
    assert_equal false, CacheService.enabled?
  end
end
