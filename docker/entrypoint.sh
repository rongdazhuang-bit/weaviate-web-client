#!/bin/sh
set -e
cd /app

export PORT="${PORT:-3000}"
export BIND_HOST="${BIND_HOST:-127.0.0.1}"
export WEAVIATE_PROXY_TARGET="${WEAVIATE_PROXY_TARGET:-http://127.0.0.1:8080}"

./node_modules/.bin/tsx server/index.ts &
NODE_PID=$!

cleanup() {
  kill "$NODE_PID" 2>/dev/null || true
}
trap cleanup TERM INT EXIT

i=0
while [ "$i" -lt 100 ]; do
  if node -e "require('net').createConnection($PORT,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.05
done

nginx -g "daemon off;" &
NGINX_PID=$!

wait $NGINX_PID
