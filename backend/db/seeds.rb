FIRST_NAMES = %w[
  Ana Bruno Carlos Daniela Eduardo Fernanda Gabriel Helena Igor Julia
  Kaio Laura Marcos Natalia Otavio Paula Rafael Sandra Thiago Ursula
  Victor Wendy Xavier Yasmin Zeca Beatriz Cintia Diego Elisa Felipe
  Giovanna Hugo Ingrid Joao Karen Leandro Mariana Nicolas Olivia Pedro
].freeze

LAST_NAMES = %w[
  Silva Santos Oliveira Souza Lima Pereira Costa Ferreira Rodrigues Almeida
  Nascimento Carvalho Dias Martins Fernandes Goncalves Ribeiro Araujo Melo
  Barbosa Rocha Cavalcanti Monteiro Moura Nogueira Vieira Rezende Azevedo
].freeze

CITIES = [
  "São Paulo, SP", "Rio de Janeiro, RJ", "Belo Horizonte, MG",
  "Curitiba, PR", "Porto Alegre, RS", "Salvador, BA",
  "Fortaleza, CE", "Manaus, AM", "Recife, PE", "Brasília, DF"
].freeze

STREETS = %w[
  das\ Flores dos\ Pinheiros da\ Liberdade do\ Sol das\ Rosas
  do\ Carmo das\ Palmeiras do\ Bosque da\ Paz dos\ Ipês
].freeze

CATEGORIES  = %w[Eletrônicos Roupas Casa Livros Alimentos Esportes Beleza Brinquedos Jardim Automotivo].freeze
ADJECTIVES  = %w[Premium Classic Ultra Lite Pro Advanced Deluxe Essential Smart Basic Turbo Max Super].freeze
NOUNS       = %w[Widget Gadget Device Tool Kit Bundle Pack Set Combo Unit Module Item Product].freeze

puts "Limpando banco de dados..."
OrderItem.delete_all
Order.delete_all
Product.delete_all
Customer.delete_all

now = Time.current

# ── Customers (100) ────────────────────────────────────────────────────────
puts "Criando 100 clientes..."
customers_data = 100.times.map do |i|
  first = FIRST_NAMES[i % FIRST_NAMES.length]
  last  = LAST_NAMES[i % LAST_NAMES.length]
  {
    name:       "#{first} #{last}",
    email:      "#{first.downcase}.#{last.downcase}#{i + 1}@exemplo.com",
    phone:      "(#{10 + (i % 89)}) 9#{(1000 + i * 7) % 9000 + 1000}-#{(2000 + i * 13) % 9000 + 1000}",
    address:    "Rua #{STREETS[i % STREETS.length]}, #{(i * 7 + 1) % 999 + 1} - #{CITIES[i % CITIES.length]}",
    created_at: now,
    updated_at: now
  }
end
Customer.insert_all!(customers_data)
customer_ids = Customer.pluck(:id)
puts "  -> #{customer_ids.size} clientes criados"

# ── Products (1000) ────────────────────────────────────────────────────────
puts "Criando 1000 produtos..."
products_data = 1000.times.map do |i|
  {
    name:           "#{ADJECTIVES[i % ADJECTIVES.length]} #{NOUNS[i % NOUNS.length]} #{i + 1}",
    description:    "Produto de alta qualidade, categoria #{CATEGORIES[i % CATEGORIES.length]}, item nº #{i + 1}.",
    price:          ((i * 37 + 100) % 99900 + 100) / 100.0,
    stock_quantity: (i * 13 + 10) % 491,
    category:       CATEGORIES[i % CATEGORIES.length],
    created_at:     now,
    updated_at:     now
  }
end
Product.insert_all!(products_data)
product_prices = Product.pluck(:id, :price).to_h
product_ids    = product_prices.keys
puts "  -> #{product_ids.size} produtos criados"

# ── Orders (20 000) ────────────────────────────────────────────────────────
puts "Criando 20000 pedidos (lotes de 1000)..."
statuses     = Order.statuses.keys
total_orders = 20_000
batch_size   = 1_000

(total_orders / batch_size).times do |batch|
  orders_data = batch_size.times.map do |j|
    idx = batch * batch_size + j
    {
      customer_id: customer_ids[idx % customer_ids.size],
      status:      statuses[idx % statuses.size],
      total_price: 0,
      created_at:  now,
      updated_at:  now
    }
  end
  Order.insert_all!(orders_data)
  print "  lote #{batch + 1}/#{total_orders / batch_size}\r"
  $stdout.flush
end
puts ""

order_ids = Order.pluck(:id)
puts "  -> #{order_ids.size} pedidos criados"

# ── OrderItems + totais (slices de 2000) ───────────────────────────────────
puts "Criando itens e calculando totais..."
order_ids.each_slice(2_000).with_index do |slice, idx|
  items_data = []
  totals     = {}

  slice.each_with_index do |order_id, j|
    order_total = 0
    num_items   = (idx * 2000 + j) % 4 + 1

    num_items.times do |k|
      pid   = product_ids[(idx * 2000 + j * 7 + k * 13) % product_ids.size]
      price = product_prices[pid]
      qty   = (idx + j + k) % 5 + 1
      order_total += price * qty
      items_data << {
        order_id:   order_id,
        product_id: pid,
        quantity:   qty,
        unit_price: price,
        created_at: now,
        updated_at: now
      }
    end
    totals[order_id] = order_total.round(2)
  end

  OrderItem.insert_all!(items_data)

  case_sql = totals.map { |id, total| "WHEN #{id} THEN #{total}" }.join(" ")
  Order.where(id: totals.keys).update_all("total_price = CASE id #{case_sql} END")

  print "  slice #{idx + 1}/#{(order_ids.size / 2000.0).ceil}\r"
  $stdout.flush
end

puts ""
puts "Seed concluído!"
puts "  Clientes: #{Customer.count}"
puts "  Produtos: #{Product.count}"
puts "  Pedidos:  #{Order.count}"
puts "  Itens:    #{OrderItem.count}"
