puts "Limpando banco de dados..."
OrderItem.delete_all
Order.delete_all
Product.delete_all
Customer.delete_all

# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------
puts "Criando clientes..."

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

STREETS = %w[das\ Flores dos\ Pinheiros da\ Liberdade do\ Sol das\ Rosas
             do\ Carmo das\ Palmeiras do\ Bosque da\ Paz dos\ Ipês].freeze

customers = 100.times.map do |i|
  first = FIRST_NAMES[i % FIRST_NAMES.length]
  last  = LAST_NAMES[i % LAST_NAMES.length]
  Customer.create!(
    name:    "#{first} #{last}",
    email:   "#{first.downcase}.#{last.downcase}#{i + 1}@exemplo.com",
    phone:   "(#{10 + (i % 89)}) 9#{(1000 + i * 7) % 9000 + 1000}-#{(2000 + i * 13) % 9000 + 1000}",
    address: "Rua #{STREETS[i % STREETS.length]}, #{(i * 7 + 1) % 999 + 1} - #{CITIES[i % CITIES.length]}"
  )
end

puts "  -> #{customers.size} clientes criados"

# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
puts "Criando produtos..."

PRODUCTS_DATA = [
  # Eletrônicos
  { name: "Smartphone Samsung Galaxy A54", description: "Tela 6.4\", 128GB, câmera tripla 50MP", price: 1_299.90, stock_quantity: 50,  category: "Eletrônicos" },
  { name: "Notebook Dell Inspiron 15",     description: "Intel Core i5, 8GB RAM, SSD 256GB",     price: 3_499.00, stock_quantity: 30,  category: "Eletrônicos" },
  { name: "Fone Bluetooth Sony WH-1000XM5", description: "Cancelamento de ruído, 30h de bateria", price: 1_899.90, stock_quantity: 40, category: "Eletrônicos" },
  { name: "Tablet iPad 10ª Geração",        description: "10.9\", Wi-Fi, 64GB",                   price: 4_199.00, stock_quantity: 20, category: "Eletrônicos" },
  { name: "Smartwatch Apple Watch SE",      description: "GPS, monitor cardíaco, 44mm",            price: 2_499.00, stock_quantity: 35, category: "Eletrônicos" },
  { name: "Câmera Canon EOS Rebel SL3",     description: "24.1MP, 4K, Wi-Fi integrado",            price: 4_890.00, stock_quantity: 15, category: "Eletrônicos" },
  { name: "Monitor LG 27\" 4K",             description: "IPS, HDR, USB-C, 60Hz",                  price: 2_799.00, stock_quantity: 25, category: "Eletrônicos" },
  { name: "Teclado Mecânico Redragon",      description: "Switch Red, RGB, ABNT2",                 price:   349.90, stock_quantity: 60, category: "Eletrônicos" },

  # Roupas
  { name: "Camiseta Básica Algodão",        description: "100% algodão, disponível em 5 cores",    price:    49.90, stock_quantity: 200, category: "Roupas" },
  { name: "Calça Jeans Slim Masculina",     description: "Tecido premium, lavagem stone",           price:   179.90, stock_quantity: 80,  category: "Roupas" },
  { name: "Vestido Floral Feminino",        description: "Viscose, comprimento midi, estampado",    price:   129.90, stock_quantity: 90,  category: "Roupas" },
  { name: "Jaqueta Corta-Vento",            description: "Impermeável, capuz removível",            price:   259.90, stock_quantity: 55,  category: "Roupas" },
  { name: "Tênis Nike Air Max 270",         description: "Amortecimento Air, solado borracha",      price:   699.90, stock_quantity: 70,  category: "Roupas" },
  { name: "Mochila Escolar 30L",            description: "Poliéster resistente, vários bolsos",     price:   149.90, stock_quantity: 100, category: "Roupas" },

  # Casa & Decoração
  { name: "Sofá 3 Lugares Suede",           description: "Tecido suede, estrutura madeira maciça",  price: 1_890.00, stock_quantity: 10, category: "Casa" },
  { name: "Luminária de Mesa LED",          description: "Luz fria/quente, intensidade ajustável",  price:   189.90, stock_quantity: 45, category: "Casa" },
  { name: "Conjunto de Panelas Tramontina", description: "5 peças, antiaderente, cabo baquelite",   price:   349.90, stock_quantity: 30, category: "Casa" },
  { name: "Tapete Persa Decorativo",        description: "100x150cm, algodão, padrão geométrico",   price:   229.90, stock_quantity: 40, category: "Casa" },
  { name: "Quadro Decorativo Canvas",       description: "60x80cm, impressão HD, moldura inclusa",  price:    99.90, stock_quantity: 60, category: "Casa" },

  # Livros
  { name: "Clean Code — Robert C. Martin",  description: "Guia de boas práticas para desenvolvedores", price:  89.90, stock_quantity: 80, category: "Livros" },
  { name: "O Poder do Hábito",              description: "Charles Duhigg, autoconhecimento",           price:  49.90, stock_quantity: 120, category: "Livros" },
  { name: "Design de Sistemas Distribuídos", description: "Brendan Burns, padrões para cloud",         price:  139.90, stock_quantity: 50, category: "Livros" },
  { name: "Sapiens: Uma Breve História",    description: "Yuval Noah Harari, história da humanidade",  price:   59.90, stock_quantity: 100, category: "Livros" },

  # Alimentos
  { name: "Café Especial Mogiana 500g",     description: "Torração média, grãos arábica, moído",    price:   59.90, stock_quantity: 150, category: "Alimentos" },
  { name: "Azeite Extra Virgem 500ml",      description: "Acidez 0,3%, importado de Portugal",      price:   89.90, stock_quantity: 90,  category: "Alimentos" },
  { name: "Kit Chocolates Belga",           description: "Caixa 500g, ao leite, meio amargo e branco", price: 129.90, stock_quantity: 70, category: "Alimentos" },
  { name: "Whey Protein Isolado 1kg",       description: "Sabor baunilha, 25g proteína por dose",   price:   199.90, stock_quantity: 60, category: "Alimentos" },

  # Esportes
  { name: "Bicicleta Mountain Bike Aro 29", description: "21 marchas, quadro alumínio, freio disco", price: 1_499.00, stock_quantity: 15, category: "Esportes" },
  { name: "Halteres Ajustáveis 20kg",       description: "Par, encaixe rápido, aço cromado",        price:   399.90, stock_quantity: 25, category: "Esportes" },
  { name: "Tapete de Yoga Antiderrapante",  description: "PVC, 6mm espessura, 183x61cm",            price:    79.90, stock_quantity: 80, category: "Esportes" },
].freeze

products = PRODUCTS_DATA.map { |attrs| Product.create!(attrs) }

puts "  -> #{products.size} produtos criados"

# ---------------------------------------------------------------------------
# Orders + OrderItems
# ---------------------------------------------------------------------------
puts "Criando pedidos..."

STATUSES = Order.statuses.keys.freeze

total_orders = 0
total_items  = 0

customers.each_with_index do |customer, ci|
  num_orders = (ci % 5) + 1

  num_orders.times do |oi|
    status_index = (ci + oi) % STATUSES.length
    order = Order.create!(
      customer: customer,
      status:   STATUSES[status_index],
      total_price: 0
    )

    num_items = (ci + oi) % 4 + 1
    chosen_products = products.rotate(ci * 3 + oi * 7).first(num_items).uniq

    chosen_products.each do |product|
      qty = (ci + oi + product.id) % 3 + 1
      OrderItem.create!(
        order:      order,
        product:    product,
        quantity:   qty,
        unit_price: product.price
      )
    end

    order.recalculate_total!
    total_items += chosen_products.size
  end

  total_orders += num_orders
end

puts "  -> #{total_orders} pedidos criados com #{total_items} itens no total"
puts ""
puts "Seed concluído!"
puts "  Clientes: #{Customer.count}"
puts "  Produtos:  #{Product.count}"
puts "  Pedidos:   #{Order.count}"
puts "  Itens:     #{OrderItem.count}"
