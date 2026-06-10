ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
  next if payload[:cached]
  next if payload[:name].in?(%w[SCHEMA EXPLAIN])
  next if payload[:sql].match?(/\A\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i)

  CacheStats.incr("db_queries")
end
