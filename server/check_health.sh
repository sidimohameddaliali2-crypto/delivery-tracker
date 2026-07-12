#!/bin/bash
echo "=== Server Health Check ==="
echo ""
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
echo "=== Active Connections on Port 5000 ==="
netstat -an | grep :5000 | wc -l
echo ""
echo "=== Recent Errors (last 10 lines) ==="
if [ -f ~/.pm2/logs/matter-delivery-api-error.log ]; then
  tail -10 ~/.pm2/logs/matter-delivery-api-error.log
else
  echo "No PM2 error log found"
fi
