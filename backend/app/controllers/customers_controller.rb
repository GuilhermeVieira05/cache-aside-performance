class CustomersController < ApplicationController
  before_action :set_customer, only: %i[show update destroy]

  def index
    customers = CacheService.fetch("customers:all") { Customer.order(:id).as_json }
    render json: customers
  end

  def show
    customer = CacheService.fetch("customers:#{@customer.id}") { @customer.as_json }
    render json: customer
  end

  def create
    customer = Customer.new(customer_params)
    if customer.save
      CacheService.invalidate("customers:all")
      render json: customer, status: :created
    else
      render_validation_errors(customer)
    end
  end

  def update
    if @customer.update(customer_params)
      CacheService.invalidate("customers:all", "customers:#{@customer.id}")
      render json: @customer
    else
      render_validation_errors(@customer)
    end
  end

  def destroy
    if @customer.destroy
      CacheService.invalidate("customers:all", "customers:#{@customer.id}")
      head :no_content
    else
      render_validation_errors(@customer)
    end
  end

  private

  def set_customer
    @customer = Customer.find(params[:id])
  end

  def customer_params
    params.require(:customer).permit(:name, :email, :phone, :address)
  end

  def render_validation_errors(record)
    render json: { errors: record.errors.full_messages }, status: :unprocessable_entity
  end
end
