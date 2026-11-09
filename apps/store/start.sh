#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
echo "Starting Axiom Tech store server..."
bun run server
