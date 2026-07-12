# Server Optimization for Delivery Tracker

## 1. Add Swap Space (Ubuntu 22.04)
If you can't upgrade RAM, add swap to avoid out-of-memory errors:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo bash -c 'echo "/swapfile none swap sw 0 0" >> /etc/fstab'
```

## 2. Node.js Memory Limit (Detailed)
Your server has 2GB RAM total. Node.js by default uses ~512MB max. Increase this for image processing.

### Option A: Temporary (current session only)
```bash
export NODE_OPTIONS="--max-old-space-size=1536"
node server.js
```

### Option B: Permanent (add to .bashrc)
```bash
echo 'export NODE_OPTIONS="--max-old-space-size=1536"' >> ~/.bashrc
source ~/.bashrc
```
Now when you run `node server.js` or `npm start`, Node.js will use up to 1.5GB RAM.

### Option C: PM2 (Production - Recommended)
Install PM2 process manager:
```bash
sudo npm install -g pm2
```

Create or update `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'delivery-tracker',
    script: './server.js',
    instances: 1,
    exec_mode: 'cluster',
    max_memory_restart: '1536M',
    node_args: '--max-old-space-size=1536',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

Start with PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Note:** 1536MB leaves ~500MB for system + swap. With 2GB swap, you have buffer room.

### Verify Memory Settings
Check current Node.js memory:
```bash
node -e "console.log('Max memory:', require('v8').getHeapStatistics().heap_size_limit / 1024 / 1024, 'MB')"
```

## 3. Nginx Reverse Proxy (Recommended)
Use Nginx to buffer uploads and offload static files:

- Install: `sudo apt install nginx`
- Basic config:

```
server {
    listen 80;
    server_name your_domain_or_ip;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 20M;
        proxy_read_timeout 300;
    }
}
```

## 4. Monitor Server Health (Detailed)

### Install Monitoring Tools
```bash
sudo apt update
sudo apt install htop iotop -y
```

### Real-Time Monitoring Commands

**1. htop - Interactive process viewer**
```bash
htop
```
- Shows CPU, RAM, and swap usage in real-time
- Press `F3` to search for "node" processes
- Press `F6` to sort by CPU or memory
- Press `q` to quit

**2. Check Memory Usage**
```bash
free -h
```
Shows total/used/free RAM and swap.

**3. Check Disk Usage**
```bash
df -h
```
Shows disk space. Watch `/` (root) - keep it under 80%.

**4. Monitor Disk I/O (requires sudo)**
```bash
sudo iotop
```
Shows which processes are reading/writing to disk (useful during image uploads).

**5. Check Active Connections**
```bash
netstat -an | grep :3000 | wc -l
```
Counts active connections to your Node.js server.

### Continuous Monitoring with PM2
If using PM2:
```bash
pm2 monit
```
Real-time CPU/RAM per process.

```bash
pm2 logs --lines 50
```
Check recent logs for errors.

### Set Up Alerts (Optional)
Install `monit` for automated alerts:
```bash
sudo apt install monit -y
```

Create `/etc/monit/conf.d/nodejs.conf`:
```
check process nodejs with pidfile /var/run/pm2.pid
  start program = "/usr/bin/pm2 start /path/to/ecosystem.config.js"
  stop program = "/usr/bin/pm2 stop all"
  if memory > 1800 MB then restart
  if cpu > 90% for 5 cycles then restart
```

Enable and start:
```bash
sudo systemctl enable monit
sudo systemctl start monit
```

### Quick Health Check Script
Create `check_health.sh`:
```bash
#!/bin/bash
echo "=== CPU & Memory ==="
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print "CPU Usage: " 100 - $1"%"}'
free -h | awk '/^Mem:/ {printf "Memory: %s / %s (%.2f%%)\n", $3, $2, ($3/$2)*100}'
free -h | awk '/^Swap:/ {printf "Swap: %s / %s\n", $3, $2}'
echo ""
echo "=== Disk Usage ==="
df -h / | awk 'NR==2 {print "Root: " $3 " / " $2 " (" $5 " used)"}'
echo ""
echo "=== Active Node Processes ==="
ps aux | grep node | grep -v grep | awk '{printf "PID: %s CPU: %s%% MEM: %s%%\n", $2, $3, $4}'
echo ""
echo "=== Active Connections on Port 3000 ==="
netstat -an | grep :3000 | wc -l
```

Make executable and run:
```bash
chmod +x check_health.sh
./check_health.sh
```

### What to Watch For
- **Memory > 1.8GB**: Server is struggling, may crash soon
- **Swap usage > 500MB**: Server is swapping heavily, performance will degrade
- **CPU > 90%** sustained: Image processing bottleneck, consider upgrading CPU
- **Disk > 80%**: Clean up old uploads or expand disk

---

# Backend Image Compression & Storage

## Image Compression (Implemented)
Backend automatically compresses uploaded photos using `sharp`:
- Quality: 70%
- Max width: 1280px
- Format: JPEG

## DigitalOcean Spaces Integration (Recommended)

**Why use Spaces?**
- Offloads images from your 25GB disk
- Faster delivery with built-in CDN
- Scalable - no server disk limits
- Cost: $5/month for 250GB + 1TB transfer

**Setup Instructions:**
See `SPACES_SETUP.md` for complete guide.

**Quick Start:**
1. Create a Space in DigitalOcean dashboard
2. Generate API keys
3. Add to `.env`:
   ```
   SPACES_KEY=your_key
   SPACES_SECRET=your_secret
   SPACES_BUCKET=your-space-name
   SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
   SPACES_REGION=nyc3
   ```
4. Run `npm install` and restart server

Images will automatically upload to Spaces instead of local disk!
