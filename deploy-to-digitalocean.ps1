# Configuration - UPDATE THESE VALUES
$SERVER_IP = "your-server-ip"
$SERVER_USER = "root"
$SERVER_PATH = "/root/matter-delivery-tracker"

Write-Host "🚀 Deploying to DigitalOcean..." -ForegroundColor Green

# Build client locally
Write-Host "📦 Building client..." -ForegroundColor Yellow
Set-Location client
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Client build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Client built successfully" -ForegroundColor Green
Set-Location ..

# Create a zip of the build
Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow
Compress-Archive -Path client/build/* -DestinationPath deploy.zip -Force

# Upload to server using SCP
Write-Host "📤 Uploading to server..." -ForegroundColor Yellow
scp deploy.zip ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/

# SSH and extract on server
Write-Host "🔄 Deploying on server..." -ForegroundColor Yellow
ssh ${SERVER_USER}@${SERVER_IP} "cd ${SERVER_PATH} && unzip -o deploy.zip -d client/build && rm deploy.zip && pm2 restart all"

# Cleanup local zip
Remove-Item deploy.zip

Write-Host "🎉 Deployment completed!" -ForegroundColor Green
Write-Host "🌐 Your app is live on your DigitalOcean server" -ForegroundColor Cyan
