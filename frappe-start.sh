#!/bin/bash
# Cephlon ERP — Frappe container startup script
# Waits for bench to be initialized before starting, then auto-starts bench.

set -e

BENCH_DIR="/workspace/bench"
PROCFILE="$BENCH_DIR/Procfile"

echo "[cephlon-start] Checking bench initialization..."

if [ ! -f "$PROCFILE" ]; then
    echo "[cephlon-start] Procfile not found at $PROCFILE"
    echo "[cephlon-start] Bench is not initialized yet."
    echo "[cephlon-start] Run the initialization steps first, then restart this container."
    echo "[cephlon-start] Keeping container alive with sleep infinity..."
    exec sleep infinity
fi

echo "[cephlon-start] Procfile found. Starting bench..."
cd "$BENCH_DIR"
exec bench start

