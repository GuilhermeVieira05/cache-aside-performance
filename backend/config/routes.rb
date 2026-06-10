Rails.application.routes.draw do
  resources :customers
  resources :products
  resources :orders

  get  "stats"        => "stats#show"
  post "stats/reset"  => "stats#reset"

  get  "cache/status" => "cache#status"
  post "cache/toggle" => "cache#toggle"

  get "up" => "rails/health#show", as: :rails_health_check
end
