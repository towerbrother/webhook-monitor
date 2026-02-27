#!/bin/bash

# webhook-monitor - Development Server Startup
# This script starts all development servers needed for local testing

set -e

echo "Starting webhook-monitor development environment..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

# Start development servers
echo "Starting all apps in development mode..."
pnpm dev
