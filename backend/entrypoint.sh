#!/bin/bash
set -e

# Remove Rails server PID to avoid "server already running" on restart
rm -f /app/tmp/pids/server.pid

exec "$@"
