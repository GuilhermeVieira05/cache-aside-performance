require "test_helper"

class CustomersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @customer = Customer.create!(
      name: "Cliente Teste",
      email: "cliente.teste@example.com",
      phone: "(31) 99999-1111",
      address: "Rua Teste, 123"
    )
  end

  test "should list customers" do
    get customers_url

    assert_response :success
    body = response.parsed_body
    assert_kind_of Array, body
    assert_includes body.pluck("id"), @customer.id
  end

  test "should show customer" do
    get customer_url(@customer)

    assert_response :success
    body = response.parsed_body
    assert_equal @customer.id, body["id"]
    assert_equal @customer.email, body["email"]
  end

  test "should create customer" do
    assert_difference("Customer.count", 1) do
      post customers_url, params: {
        customer: {
          name: "Nova Cliente",
          email: "nova.cliente@example.com",
          phone: "(31) 98888-2222",
          address: "Avenida API, 456"
        }
      }
    end

    assert_response :created
    assert_equal "nova.cliente@example.com", response.parsed_body["email"]
  end

  test "should update customer" do
    put customer_url(@customer), params: {
      customer: {
        name: "Cliente Atualizada",
        address: "Rua Atualizada, 789"
      }
    }

    assert_response :success
    @customer.reload
    assert_equal "Cliente Atualizada", @customer.name
    assert_equal "Rua Atualizada, 789", @customer.address
  end

  test "should destroy customer" do
    assert_difference("Customer.count", -1) do
      delete customer_url(@customer)
    end

    assert_response :no_content
  end

  test "should reject invalid customer" do
    assert_no_difference("Customer.count") do
      post customers_url, params: {
        customer: {
          name: "",
          email: "email-invalido",
          phone: "telefone invalido"
        }
      }
    end

    assert_response :unprocessable_entity
    assert_not_empty response.parsed_body["errors"]
  end

  test "should return not found for missing customer" do
    get customer_url(id: 0)

    assert_response :not_found
    assert_equal "Record not found", response.parsed_body["error"]
  end
end
