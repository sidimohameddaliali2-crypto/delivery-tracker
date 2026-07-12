#!/bin/bash

echo "🚀 Starting Matter Delivery Deployment..."

# Build client
echo "📦 Building client..."
cd client
npm run build
cd ..

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose build

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Start new containers
echo "✅ Starting new containers..."
docker-compose up -d

echo "🎉 Deployment completed successfully!"
echo "📊 Application running on: http://localhost:5000"
echo "🗄️  MongoDB running on: localhost:27017"