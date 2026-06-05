Rails.application.routes.draw do
  resources :customers
  resources :products
  resources :orders

  get "up" => "rails/health#show", as: :rails_health_check
end
