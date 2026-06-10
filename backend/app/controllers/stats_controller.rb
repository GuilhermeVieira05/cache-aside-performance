class StatsController < ApplicationController
  def show
    render json: CacheStats.all
  end

  def reset
    CacheStats.reset
    head :no_content
  end
end
