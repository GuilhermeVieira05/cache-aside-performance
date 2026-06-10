class CacheController < ApplicationController
  def status
    render json: { enabled: CacheService.enabled? }
  end

  def toggle
    CacheService.toggle!
    render json: { enabled: CacheService.enabled? }
  end
end
