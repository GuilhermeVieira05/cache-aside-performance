require "test_helper"

class CacheServiceTest < ActiveSupport::TestCase
  setup do
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    Rails.cache.clear
  end

  teardown do
    Rails.cache = @original_cache
  end

  test "fetch executa o bloco e retorna o valor no MISS" do
    calls = 0
    result = CacheService.fetch("test:miss") { calls += 1; "valor_do_banco" }
    assert_equal "valor_do_banco", result
    assert_equal 1, calls
  end

  test "fetch retorna valor cacheado sem executar o bloco no HIT" do
    CacheService.fetch("test:hit") { "primeiro" }
    calls = 0
    result = CacheService.fetch("test:hit") { calls += 1; "segundo" }
    assert_equal "primeiro", result
    assert_equal 0, calls
  end

  test "invalidate remove a chave do cache" do
    CacheService.fetch("test:inv") { "cacheado" }
    CacheService.invalidate("test:inv")
    calls = 0
    CacheService.fetch("test:inv") { calls += 1; "recarregado" }
    assert_equal 1, calls
  end

  test "fetch retorna valor falsy cacheado sem re-executar o bloco" do
    calls = 0
    CacheService.fetch("test:falsy") { calls += 1; false }
    result = CacheService.fetch("test:falsy") { calls += 1; true }
    assert_equal false, result
    assert_equal 1, calls
  end

  test "invalidate remove multiplas chaves" do
    CacheService.fetch("test:a") { "a" }
    CacheService.fetch("test:b") { "b" }
    CacheService.invalidate("test:a", "test:b")
    a_calls = 0
    b_calls = 0
    CacheService.fetch("test:a") { a_calls += 1; "a2" }
    CacheService.fetch("test:b") { b_calls += 1; "b2" }
    assert_equal 1, a_calls
    assert_equal 1, b_calls
  end
end
