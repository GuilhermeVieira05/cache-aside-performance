require "test_helper"

class OrdersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @customer = Customer.create!(
      name: "Cliente Orders",
      email: "orders.test@example.com",
      phone: "(11) 99999-0000",
      address: "Rua Ordens, 1"
    )
    @product = Product.create!(
      name: "Produto Orders",
      description: "Para testes",
      price: 100.00,
      stock_quantity: 50,
      category: "Teste"
    )
    @order = Order.create!(customer: @customer, status: :pending, total_price: 0)
    OrderItem.create!(order: @order, product: @product, quantity: 2, unit_price: @product.price)
    @order.recalculate_total!
  end

  test "should list orders" do
    get orders_url
    assert_response :success
    body = response.parsed_body
    assert_kind_of Array, body
    assert_includes body.pluck("id"), @order.id
  end

  test "should show order with items" do
    get order_url(@order)
    assert_response :success
    body = response.parsed_body
    assert_equal @order.id, body["id"]
    assert_kind_of Array, body["order_items"]
    assert_equal 1, body["order_items"].size
  end

  test "should create order with items" do
    assert_difference(["Order.count", "OrderItem.count"], 1) do
      post orders_url, params: {
        order: {
          customer_id: @customer.id,
          status: "pending",
          order_items_attributes: [
            { product_id: @product.id, quantity: 3 }
          ]
        }
      }
    end
    assert_response :created
    body = response.parsed_body
    assert_equal "pending", body["status"]
    assert_in_delta 300.00, body["total_price"].to_f, 0.01
    assert_kind_of Array, body["order_items"]
  end

  test "should update order status" do
    patch order_url(@order), params: { order: { status: "processing" } }
    assert_response :success
    @order.reload
    assert_equal "processing", @order.status
  end

  test "should destroy order" do
    assert_difference("Order.count", -1) do
      delete order_url(@order)
    end
    assert_response :no_content
  end

  test "should return not found for missing order" do
    get order_url(id: 0)
    assert_response :not_found
    assert_equal "Record not found", response.parsed_body["error"]
  end

  test "should return not found when product does not exist" do
    post orders_url, params: {
      order: {
        customer_id: @customer.id,
        order_items_attributes: [{ product_id: 0, quantity: 1 }]
      }
    }
    assert_response :not_found
  end

  test "should reject order with missing customer" do
    assert_no_difference("Order.count") do
      post orders_url, params: {
        order: {
          order_items_attributes: [{ product_id: @product.id, quantity: 1 }]
        }
      }
    end
    assert_response :unprocessable_entity
    assert_not_empty response.parsed_body["errors"]
  end
end
