#!/bin/bash

# C2PA Extension UAT Test Server Startup Script

echo "🔒 C2PA Extension UAT Test Server"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

# Navigate to test directory
cd "$(dirname "$0")"

# Define the port from server.js using awk for portability
PORT=$(awk '/const PORT = / {print $4}' server.js | sed 's/;//')

echo "📦 Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
fi

echo ""

# Check if the port is already in use using netstat and lsof for broader compatibility
# Try to find PID using lsof first, as it's more direct
PID=$(lsof -i tcp:$PORT -t 2>/dev/null)

if [ -z "$PID" ]; then
    # Fallback to netstat if lsof doesn't return PID or is not available
    PID=$(netstat -anv | grep LISTEN | awk '{print $9}' | grep -o "[0-9]*" | xargs -I {} sh -c "lsof -i tcp:$PORT -t -a -p {} 2>/dev/null" | head -n 1)
fi

if [ -n "$PID" ]; then
    read -p "Port $PORT is already in use by PID $PID. Do you want to restart the service? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Killing process $PID..."
        kill -9 "$PID" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "Process killed. Restarting server..."
            sleep 1 # Give a moment for the port to free up
        else
            echo "Failed to kill process $PID. It might not exist or you don't have permissions."
            echo "Aborting server start. Please free up port $PORT manually or change the port in test/server.js."
            exit 1
        fi
    else
        echo "Aborting server start. Please free up port $PORT manually or change the port in test/server.js."
        exit 1
    fi
fi

echo "🚀 Starting UAT test server on port $PORT..."
echo ""
echo "📋 After server starts:"
echo "   1. Install C2PA extension in Chrome"
echo "   2. Open http://localhost:$PORT"
echo "   3. Click on test links to validate extension"
echo ""

# Start server
npm start