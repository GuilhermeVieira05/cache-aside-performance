Rails.application.routes.draw do
  resources :customers
  resources :products
  resources :orders

  get  "stats"       => "stats#show"
  post "stats/reset" => "stats#reset"

  get "up" => "rails/health#show", as: :rails_health_check
end
