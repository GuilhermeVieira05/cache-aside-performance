require "test_helper"

class ProductsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @product = Product.create!(
      name: "Notebook Teste",
      description: "Notebook para testes de API",
      price: 3499.90,
      stock_quantity: 12,
      category: "Eletronicos"
    )
  end

  test "should list products" do
    get products_url

    assert_response :success
    body = response.parsed_body
    assert_kind_of Array, body
    assert_includes body.pluck("id"), @product.id
  end

  test "should show product" do
    get product_url(@product)

    assert_response :success
    body = response.parsed_body
    assert_equal @product.id, body["id"]
    assert_equal @product.name, body["name"]
  end

  test "should create product" do
    assert_difference("Product.count", 1) do
      post products_url, params: {
        product: {
          name: "Mouse Sem Fio",
          description: "Mouse ergonomico",
          price: 149.90,
          stock_quantity: 25,
          category: "Eletronicos"
        }
      }
    end

    assert_response :created
    assert_equal "Mouse Sem Fio", response.parsed_body["name"]
  end

  test "should update product" do
    patch product_url(@product), params: {
      product: {
        name: "Notebook Atualizado",
        stock_quantity: 9
      }
    }

    assert_response :success
    @product.reload
    assert_equal "Notebook Atualizado", @product.name
    assert_equal 9, @product.stock_quantity
  end

  test "should destroy product" do
    assert_difference("Product.count", -1) do
      delete product_url(@product)
    end

    assert_response :no_content
  end

  test "should reject invalid product" do
    assert_no_difference("Product.count") do
      post products_url, params: {
        product: {
          name: "",
          price: -1,
          stock_quantity: -3,
          category: ""
        }
      }
    end

    assert_response :unprocessable_entity
    assert_not_empty response.parsed_body["errors"]
  end

  test "should return not found for missing product" do
    get product_url(id: 0)

    assert_response :not_found
    assert_equal "Record not found", response.parsed_body["error"]
  end
end
