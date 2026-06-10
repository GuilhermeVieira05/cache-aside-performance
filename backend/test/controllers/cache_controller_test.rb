require "test_helper"

class CacheControllerTest < ActionDispatch::IntegrationTest
  setup do
    CacheService.instance_variable_set(:@override_enabled, nil)
  end

  test "GET /cache/status retorna enabled como boolean" do
    get "/cache/status"
    assert_response :success
    data = JSON.parse(response.body)
    assert_includes [true, false], data["enabled"]
  end

  test "POST /cache/toggle inverte o estado e retorna novo estado" do
    CacheService.instance_variable_set(:@override_enabled, true)
    post "/cache/toggle"
    assert_response :success
    data = JSON.parse(response.body)
    assert_equal false, data["enabled"]
  end

  test "POST /cache/toggle duas vezes volta ao estado original" do
    CacheService.instance_variable_set(:@override_enabled, true)
    post "/cache/toggle"
    post "/cache/toggle"
    data = JSON.parse(response.body)
    assert_equal true, data["enabled"]
  end
end
