class OrdersController < ApplicationController
  before_action :set_order, only: %i[show update destroy]

  def index
    orders, cache_status = CacheService.fetch("orders:all") do
      Order.includes(order_items: :product).order(:id).to_json(
        include: { order_items: { only: %i[id product_id quantity unit_price] } }
      )
    end
    response.headers["X-Cache"] = cache_status.to_s.upcase
    render json: orders
  end

  def show
    order, cache_status = CacheService.fetch("orders:#{@order.id}") do
      @order.to_json(
        include: { order_items: { only: %i[id product_id quantity unit_price] } }
      )
    end
    response.headers["X-Cache"] = cache_status.to_s.upcase
    render json: order
  end

  def create
    order = nil
    ActiveRecord::Base.transaction do
      order = Order.create!(
        customer_id: order_params[:customer_id],
        status: order_params[:status] || :pending,
        total_price: 0
      )
      Array(order_params[:order_items_attributes]).each do |item_attrs|
        product = Product.find(item_attrs[:product_id])
        order.order_items.create!(
          product: product,
          quantity: item_attrs[:quantity].to_i,
          unit_price: product.price
        )
      end
      order.recalculate_total!
    end
    CacheService.invalidate("orders:all")
    response.headers["X-Cache"] = "WRITE"
    render json: order.as_json(
      include: { order_items: { only: %i[id product_id quantity unit_price] } }
    ), status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  def update
    if @order.update(update_params)
      CacheService.invalidate("orders:all", "orders:#{@order.id}")
      response.headers["X-Cache"] = "WRITE"
      render json: @order
    else
      render json: { errors: @order.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @order.destroy
    CacheService.invalidate("orders:all", "orders:#{@order.id}")
    response.headers["X-Cache"] = "INVALIDATED"
    head :no_content
  end

  private

  def set_order
    @order = Order.includes(order_items: :product).find(params[:id])
  end

  def order_params
    params.require(:order).permit(
      :customer_id, :status,
      order_items_attributes: %i[product_id quantity]
    )
  end

  def update_params
    params.require(:order).permit(:status)
  end
end
