#!/bin/bash

# Configuration - UPDATE THESE VALUES
SERVER_IP="your-server-ip"
SERVER_USER="root"
SERVER_PATH="/root/matter-delivery-tracker"

echo "🚀 Deploying to DigitalOcean..."

# Build client locally
echo "📦 Building client..."
cd client
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Client build failed!"
    exit 1
fi

echo "✅ Client built successfully"

# Go back to root
cd ..

# Sync files to server (excluding node_modules)
echo "📤 Uploading files to server..."
rsync -avz --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'client/node_modules' \
    --exclude 'server/node_modules' \
    --exclude 'client/.env.local' \
    ./ ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/

if [ $? -ne 0 ]; then
    echo "❌ File upload failed!"
    exit 1
fi

echo "✅ Files uploaded"

# Restart server on DigitalOcean
echo "🔄 Restarting services on server..."
ssh ${SERVER_USER}@${SERVER_IP} << 'EOF'
cd /root/matter-delivery-tracker
pm2 restart all || pm2 start server/ecosystem.config.cjs
EOF

echo "🎉 Deployment completed!"
echo "🌐 Your app is live on your DigitalOcean server"
