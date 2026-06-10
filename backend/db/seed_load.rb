# Seed pesado para o teste de carga: gera um volume grande de dados para que a query
# com JOINs (índice de pedidos) fique cara no banco e o cache-aside passe a compensar.
# Usa insert_all (bulk) para ser rápido. Configurável por ENV.
#
#   docker compose run --rm -e ORDERS=10000 -e PRODUCTS=3000 -e CUSTOMERS=500 \
#     web ./bin/rails runner db/seed_load.rb

customers_n = ENV.fetch("CUSTOMERS", "500").to_i
products_n  = ENV.fetch("PRODUCTS", "3000").to_i
orders_n    = ENV.fetch("ORDERS", "10000").to_i

now = Time.current
puts "Limpando banco..."
OrderItem.delete_all
Order.delete_all
Product.delete_all
Customer.delete_all

puts "Inserindo #{customers_n} clientes..."
Customer.insert_all(
  Array.new(customers_n) { |i|
    { name: "Cliente #{i}", email: "cliente#{i}@exemplo.com",
      phone: "(11) 9#{format('%04d', i % 10000)}-0000",
      address: "Rua #{i}, São Paulo, SP", created_at: now, updated_at: now }
  }
)
customer_ids = Customer.pluck(:id)

puts "Inserindo #{products_n} produtos..."
categories = %w[Eletrônicos Roupas Casa Livros Alimentos Esportes]
Product.insert_all(
  Array.new(products_n) { |i|
    { name: "Produto #{i}", description: "Descrição do produto #{i}",
      price: (10 + (i % 500)) + 0.99, stock_quantity: 50 + (i % 200),
      category: categories[i % categories.size], created_at: now, updated_at: now }
  }
)
product_rows = Product.pluck(:id, :price) # [[id, price], ...]

puts "Inserindo #{orders_n} pedidos..."
statuses = Order.statuses.values
Order.insert_all(
  Array.new(orders_n) { |_i|
    { customer_id: customer_ids.sample, status: statuses.sample,
      total_price: 0, created_at: now, updated_at: now }
  }
)
order_ids = Order.pluck(:id)

puts "Inserindo itens (2-4 por pedido)..."
items_total = 0
order_ids.each_slice(2000) do |slice|
  batch = []
  slice.each do |oid|
    (2 + rand(3)).times do
      pid, price = product_rows.sample
      batch << { order_id: oid, product_id: pid, quantity: 1 + rand(3),
                 unit_price: price, created_at: now, updated_at: now }
    end
  end
  OrderItem.insert_all(batch)
  items_total += batch.size
end

puts "Recalculando totais..."
ActiveRecord::Base.connection.execute(<<~SQL)
  UPDATE orders o SET total_price = sub.total
  FROM (SELECT order_id, SUM(quantity * unit_price) AS total
        FROM order_items GROUP BY order_id) sub
  WHERE o.id = sub.order_id
SQL

puts "Pronto: clientes=#{Customer.count} produtos=#{Product.count} " \
     "pedidos=#{Order.count} itens=#{OrderItem.count}"
