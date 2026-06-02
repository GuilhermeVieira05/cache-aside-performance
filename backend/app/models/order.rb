class Order < ApplicationRecord
  belongs_to :customer
  has_many :order_items, dependent: :destroy
  has_many :products, through: :order_items

  enum :status, { pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: 4 }

  validates :total_price, numericality: { greater_than_or_equal_to: 0 }

  def recalculate_total!
    update!(total_price: order_items.sum("quantity * unit_price"))
  end
end
