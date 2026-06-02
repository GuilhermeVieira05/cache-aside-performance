class CreateOrders < ActiveRecord::Migration[7.2]
  def change
    create_table :orders do |t|
      t.references :customer, null: false, foreign_key: true
      t.integer :status, null: false, default: 0
      t.decimal :total_price, precision: 10, scale: 2, null: false, default: 0

      t.timestamps
    end

    add_index :orders, :status
    add_index :orders, :created_at
  end
end
