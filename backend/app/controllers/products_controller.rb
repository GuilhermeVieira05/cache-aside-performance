class ProductsController < ApplicationController
  before_action :set_product, only: %i[show update destroy]

  def index
    render json: Product.order(:id)
  end

  def show
    render json: @product
  end

  def create
    product = Product.new(product_params)

    if product.save
      render json: product, status: :created
    else
      render_validation_errors(product)
    end
  end

  def update
    if @product.update(product_params)
      render json: @product
    else
      render_validation_errors(@product)
    end
  end

  def destroy
    if @product.destroy
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
