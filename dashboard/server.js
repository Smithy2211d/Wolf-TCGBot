import express from 'express';
import cors from 'cors';
import basicAuth from 'express-basic-auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '..', '.env');
console.log('Loading .env from:', envPath);
if (existsSync(envPath)) {
  console.log('.env exists, loading');
  dotenv.config({ path: envPath });
} else {
  console.log('.env does not exist');
  try {
    const envBuffer = readFileSync(envPath);
    const parsed = dotenv.parse(envBuffer);
    for (const [key, value] of Object.entries(parsed)) process.env[key] = value;
  } catch {
    console.warn("⚠️ .env not found. Make sure environment variables are set!");
  }
}

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

let previousCpuTimes = null;
let previousMeasurementTime = null;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

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
      const dateMatch = file.match(/wolf_tcg_log_(\d{4}-\d{2}-\d{2})\.txt/);
      return dateMatch ? dateMatch[1] : null;
    }).filter(date => date).sort().reverse(); 

    res.json({ dates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read log directory' });
  }
});

app.get('/api/summary', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    const reqPath = path.join(__dirname, '..', 'request_counter.json');

    let state = { liveStatus: {} };
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
    const requests = JSON.parse(fs.readFileSync(reqPath, 'utf8'));

    const liveCount = Object.values(state.liveStatus || {}).filter(Boolean).length;
    const tikTokUsers = (process.env.TIKTOK_USERS || "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);
    const totalUsers = tikTokUsers.length;

    res.json({
      liveStreams: liveCount,
      totalUsers,
      requestCount: requests.count,
      requestLimit: 1000, 
      date: requests.date
    });
  } catch (err) {
    console.error('Error in /api/summary:', err);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.get('/api/live-history', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    let state = { liveHistory: [] };
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
    const history = (state.liveHistory || [])
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 20);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load live history' });
  }
});

app.get('/api/tiktok-users', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    let state = { liveHistory: [], liveStatus: {}, streamStartTimes: {} };
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }

    const tikTokUsers = (process.env.TIKTOK_USERS || "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u);

    const usersWithInfo = tikTokUsers.map(user => {
      const isLive = state.liveStatus?.[user] || false;
      const lastStream = (state.liveHistory || [])
        .filter(entry => entry.userId === user)
        .sort((a, b) => b.startTime - a.startTime)[0];

      return {
        username: user,
        isLive: isLive,
        lastStream: lastStream ? {
          startTime: lastStream.startTime,
          endTime: lastStream.endTime,
          duration: lastStream.endTime ? (lastStream.endTime - lastStream.startTime) / 1000 : null,
          title: lastStream.title || 'No title'
        } : null
      };
    });

    console.log('TikTok users from env:', tikTokUsers);
    console.log('TikTok users API returning:', usersWithInfo);
    res.json({ users: usersWithInfo });
  } catch (err) {
    console.error('Error in /api/tiktok-users:', err);
    res.status(500).json({ error: 'Failed to load TikTok users' });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const statePath = path.join(__dirname, '..', 'stream_state.json');
    let state = { liveHistory: [], liveStatus: {}, streamStartTimes: {} };
    if (fs.existsSync(statePath)) {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }

    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    
    const todayStreams = (state.liveHistory || []).filter(entry => 
      entry.startTime >= todayStart
    );

    const streamsToday = todayStreams.length;
    const totalStreamTime = todayStreams.reduce((sum, entry) => {
      const duration = entry.endTime ? (entry.endTime - entry.startTime) : (now - entry.startTime);
      return sum + duration / 1000; 
    }, 0);

    const avgStreamDuration = streamsToday > 0 ? totalStreamTime / streamsToday : 0;
r
    const streamerCounts = {};
    todayStreams.forEach(entry => {
      streamerCounts[entry.userId] = (streamerCounts[entry.userId] || 0) + 1;
    });
    const mostActive = Object.entries(streamerCounts)
      .sort((a, b) => b[1] - a[1])[0];

    const recentThreshold = now - (5 * 60 * 1000);
    const recentLive = Object.entries(state.liveStatus || {})
      .filter(([userId, isLive]) => {
        const startTime = state.streamStartTimes?.[userId];
        return isLive && startTime && startTime >= recentThreshold;
      })
      .map(([userId]) => ({
        userId,
        startTime: state.streamStartTimes[userId],
        title: state.titleCache?.[userId] || 'No title',
        user: state.userCache?.[userId] || {}
      }));

    res.json({
      streamsToday,
      totalStreamTime: Math.round(totalStreamTime),
      avgStreamDuration: Math.round(avgStreamDuration),
      mostActiveStreamer: mostActive ? {
        userId: mostActive[0],
        count: mostActive[1]
      } : null,
      recentLive
    });
  } catch (err) {
    console.error('Error in /api/stats:', err);
    res.status(500).json({ error: 'Failed to generate stats' });
  }
});

app.get('/api/system', (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = Math.round((usedMem / totalMem) * 100);
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
        cpuUsagePercent = Math.max(0, Math.min(100, cpuUsagePercent));
      }
    } else {
      cpuUsagePercent = Math.round(os.loadavg()[0] * 100 / cpus.length);
      cpuUsagePercent = Math.max(0, Math.min(100, cpuUsagePercent));
    }

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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const networkInterfaces = os.networkInterfaces();
  const addresses = [];
  
  Object.keys(networkInterfaces).forEach((key) => {
    networkInterfaces[key].forEach((details) => {
      if (details.family === 'IPv4' && !details.internal) {
        addresses.push(details.address);
      }
    });
  });

  console.log(`\n🐺 Dashboard server is running!`);
  console.log(`\n📱 Access from your devices:`);
  console.log(`   Local:    http://localhost:${PORT}`);
  addresses.forEach(addr => {
    console.log(`   Network:  http://${addr}:${PORT}`);
  });
  console.log(`\n💡 Use the Network address to connect from your phone\n`);
});