class ProductsController < ApplicationController
  before_action :set_product, only: %i[show update destroy]

  def index
    products, cache_status = CacheService.fetch("products:all") { Product.order(:id).to_json }
    response.headers["X-Cache"] = cache_status.to_s.upcase
    render json: products
  end

  def show
    product, cache_status = CacheService.fetch("products:#{@product.id}") { @product.to_json }
    response.headers["X-Cache"] = cache_status.to_s.upcase
    render json: product
  end

  def create
    product = Product.new(product_params)
    if product.save
      CacheService.invalidate("products:all")
      response.headers["X-Cache"] = "WRITE"
      render json: product, status: :created
    else
      render_validation_errors(product)
    end
  end

  def update
    if @product.update(product_params)
      CacheService.invalidate("products:all", "products:#{@product.id}")
      response.headers["X-Cache"] = "WRITE"
      render json: @product
    else
      render_validation_errors(@product)
    end
  end

  def destroy
    if @product.destroy
      CacheService.invalidate("products:all", "products:#{@product.id}")
      response.headers["X-Cache"] = "INVALIDATED"
      head :no_content
    else
      render_validation_errors(@product)
    end
  end

  private

  def set_product
    @product = Product.find(params[:id])
  end

  def product_params
    params.require(:product).permit(:name, :description, :price, :stock_quantity, :category)
  end

  def render_validation_errors(record)
    render json: { errors: record.errors.full_messages }, status: :unprocessable_entity
  end
end
