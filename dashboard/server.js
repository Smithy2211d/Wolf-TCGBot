import express from 'express';
import cors from 'cors';
import basicAuth from 'express-basic-auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Store previous CPU measurements for accurate usage calculation
let previousCpuTimes = null;
let previousMeasurementTime = null;

// Basic auth for security (set DASHBOARD_USER and DASHBOARD_PASS in .env)
if (process.env.DASHBOARD_USER && process.env.DASHBOARD_PASS) {
  app.use(basicAuth({
    users: { [process.env.DASHBOARD_USER]: process.env.DASHBOARD_PASS },
    challenge: true,
  }));
}

app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/state', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read stream state' });
  }
});

app.get('/api/requests', (req, res) => {
  try {
    const reqPath = path.join(__dirname, '..', 'request_counter.json');
    const data = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read request counter' });
  }
});

app.get('/api/logs', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });

  try {
    const logPath = path.join(__dirname, '..', 'logs', `wolf_tcg_log_${date}.txt`);
    if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'Log file not found' });

    const content = fs.readFileSync(logPath, 'utf8');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read log file' });
  }
});

app.get('/api/log-dates', (req, res) => {
  try {
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) return res.json({ dates: [] });

    const files = fs.readdirSync(logsDir);
    const logFiles = files.filter(file => file.startsWith('wolf_tcg_log_') && file.endsWith('.txt'));

    const dates = logFiles.map(file => {
      // Extract date from filename: wolf_tcg_log_2025-12-19.txt -> 2025-12-19
      const dateMatch = file.match(/wolf_tcg_log_(\d{4}-\d{2}-\d{2})\.txt/);
      return dateMatch ? dateMatch[1] : null;
    }).filter(date => date).sort().reverse(); // Sort by date descending (newest first)

    res.json({ dates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read log directory' });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    const reqPath = path.join(__dirname, '..', 'request_counter.json');

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const requests = JSON.parse(fs.readFileSync(reqPath, 'utf8'));

    const liveCount = Object.values(state.liveStatus || {}).filter(Boolean).length;
    const totalUsers = Object.keys(state.liveStatus || {}).length;

    res.json({
      liveStreams: liveCount,
      totalUsers,
      requestCount: requests.count,
      requestLimit: 1000, // hardcoded from bot
      date: requests.date
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.get('/api/tiktok-users', (req, res) => {
  try {
    const tikTokUsers = (process.env.TIKTOK_USERS || "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);

    res.json({
      users: tikTokUsers,
      count: tikTokUsers.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get TikTok users' });
  }
});

app.get('/api/system', (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = Math.round((usedMem / totalMem) * 100);

    // CPU usage calculation (measures over time interval for accuracy)
    const cpus = os.cpus();
    const currentTime = Date.now();

    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    let cpuUsagePercent = 0;

    if (previousCpuTimes && previousMeasurementTime) {
      const idleDiff = totalIdle - previousCpuTimes.idle;
      const tickDiff = totalTick - previousCpuTimes.total;
      const timeDiff = currentTime - previousMeasurementTime;

      if (tickDiff > 0) {
        cpuUsagePercent = Math.round(100 - ~~(100 * idleDiff / tickDiff));
        // Ensure percentage is between 0 and 100
        cpuUsagePercent = Math.max(0, Math.min(100, cpuUsagePercent));
      }
    } else {
      // First measurement - show current load average as fallback
      cpuUsagePercent = Math.round(os.loadavg()[0] * 100 / cpus.length);
      cpuUsagePercent = Math.max(0, Math.min(100, cpuUsagePercent));
    }

    // Store current measurements for next calculation
    previousCpuTimes = { idle: totalIdle, total: totalTick };
    previousMeasurementTime = currentTime;

    res.json({
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown',
        usagePercent: cpuUsagePercent
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: memUsagePercent
      },
      loadAverage: os.loadavg(),
      timestamp: currentTime
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get system info' });
  }
});

// Catch-all handler: send back index.html for client-side routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
});