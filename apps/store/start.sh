#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
echo "Starting Play Store server..."
bun run server
