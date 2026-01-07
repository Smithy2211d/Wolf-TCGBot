async function fetchAPI(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

let systemHistory = [];
const MAX_HISTORY_POINTS = 150;

systemHistory.push({
  time: new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }),
  cpu: 0,
  memory: 0
});

async function loadSummary() {
  try {
    const summary = await fetchAPI('/api/summary');
    document.getElementById('live-count').textContent = summary.liveStreams;
    document.getElementById('total-users').textContent = summary.totalUsers;
    document.getElementById('request-count').textContent = summary.requestCount;

    if (window.requestChart) {
      window.requestChart.data.datasets[0].data = [summary.requestCount, summary.requestLimit - summary.requestCount];
      window.requestChart.update();
    } else {
      const ctx = document.getElementById('request-chart').getContext('2d');
      window.requestChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Used', 'Remaining'],
          datasets: [{
            data: [summary.requestCount, summary.requestLimit - summary.requestCount],
            backgroundColor: ['#ff6384', '#36a2eb']
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }
  } catch (err) {
    console.error('Failed to load summary:', err);
  }
}

async function loadStats() {
  try {
    const stats = await fetchAPI('/api/stats');
    
    document.getElementById('streams-today').textContent = stats.streamsToday;
    
    const hours = Math.floor(stats.totalStreamTime / 3600);
    const minutes = Math.floor((stats.totalStreamTime % 3600) / 60);
    document.getElementById('total-stream-time').textContent = `${hours}h ${minutes}m`;
    
    const avgMinutes = Math.floor(stats.avgStreamDuration / 60);
    document.getElementById('avg-duration').textContent = `${avgMinutes}m`;
    
    document.getElementById('most-active').textContent = stats.mostActiveStreamer ? 
      `${stats.mostActiveStreamer.userId} (${stats.mostActiveStreamer.count})` : '-';

    const alertsDiv = document.getElementById('live-alerts');
    if (stats.recentLive && stats.recentLive.length > 0) {
      alertsDiv.innerHTML = stats.recentLive.map(stream => {
        const timeAgo = Math.floor((Date.now() - stream.startTime) / 1000);
        const minutesAgo = Math.floor(timeAgo / 60);
        return `
          <div class="alert-box live">
            <div class="alert-header">🔴 LIVE NOW: ${stream.user.uniqueId || stream.userId}</div>
            <div>Started ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago</div>
            <div style="margin-top: 5px; font-style: italic;">${stream.title}</div>
          </div>
        `;
      }).join('');
    } else {
      alertsDiv.innerHTML = '';
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadLiveStreams() {
  try {
    const state = await fetchAPI('/api/state');
    const list = document.getElementById('live-list');
    list.innerHTML = '';

    const liveUsers = Object.entries(state.liveStatus || {})
      .filter(([_, isLive]) => isLive)
      .map(([userId, _]) => userId);

    if (liveUsers.length === 0) {
      list.innerHTML = '<li>No live streams currently</li>';
      return;
    }

    liveUsers.forEach(userId => {
      const li = document.createElement('li');
      const user = state.userCache?.[userId] || {};
      const title = state.titleCache?.[userId] || 'No title';
      const startTime = state.streamStartTimes?.[userId];
      const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

      li.innerHTML = `
        <strong>${user.uniqueId || userId}</strong><br>
        Title: ${title}<br>
        Duration: ${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m<br>
        <a href="https://www.tiktok.com/@${userId}" target="_blank">Watch Live</a>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load live streams:', err);
    document.getElementById('live-list').innerHTML = '<li>Error loading streams</li>';
  }
}

async function loadLiveHistory() {
  try {
    const data = await fetchAPI('/api/live-history');
    const list = document.getElementById('live-history-list');
    list.innerHTML = '';

    if (data.history.length === 0) {
      list.innerHTML = '<li>No live streams recorded yet</li>';
      return;
    }

    data.history.forEach(entry => {
      const li = document.createElement('li');
      const startDate = new Date(entry.startTime).toLocaleString();
      const endDate = entry.endTime ? new Date(entry.endTime).toLocaleString() : 'Ongoing';
      const duration = entry.endTime ? Math.floor((entry.endTime - entry.startTime) / 1000) : Math.floor((Date.now() - entry.startTime) / 1000);

      li.innerHTML = `
        <strong>${entry.userId}</strong><br>
        Title: ${entry.title}<br>
        Started: ${startDate}<br>
        Ended: ${endDate}<br>
        Duration: ${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m<br>
        <a href="https://www.tiktok.com/@${entry.userId}" target="_blank">View Profile</a>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load live history:', err);
    document.getElementById('live-history-list').innerHTML = '<li>Error loading history</li>';
  }
}

async function loadTikTokUsers() {
  try {
    const data = await fetchAPI('/api/tiktok-users');
    const list = document.getElementById('tiktok-users-list');
    list.innerHTML = '';

    if (!data.users || data.users.length === 0) {
      list.innerHTML = '<li>No TikTok users configured</li>';
      return;
    }

    data.users.forEach(userInfo => {
      console.log('User info:', userInfo);
      const li = document.createElement('li');
      const username = userInfo.username;
      const statusBadge = userInfo.isLive ? 
        '<span class="badge live">🔴 LIVE</span>' : 
        '<span class="badge offline">OFFLINE</span>';
      
      let lastStreamInfo = '';
      if (userInfo.lastStream) {
        const lastDate = new Date(userInfo.lastStream.startTime);
        const daysAgo = Math.floor((Date.now() - userInfo.lastStream.startTime) / (1000 * 60 * 60 * 24));
        const duration = userInfo.lastStream.duration ? 
          `${Math.floor(userInfo.lastStream.duration / 3600)}h ${Math.floor((userInfo.lastStream.duration % 3600) / 60)}m` : 
          'Ongoing';
        
        lastStreamInfo = `
          <div class="user-info">
            <strong>Last Stream:</strong> ${daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + ' days ago'}<br>
            <strong>Duration:</strong> ${duration}<br>
            <strong>Title:</strong> ${userInfo.lastStream.title || 'No title'}
          </div>
        `;
      } else {
        lastStreamInfo = '<div class="user-info">No stream history</div>';
      }

      li.innerHTML = `
        <div style="margin-bottom: 10px;">
          <strong style="font-size: 1.1em;">${username}</strong> ${statusBadge}
        </div>
        ${lastStreamInfo}
        <iframe src="https://www.tiktok.com/embed/@${username}" width="50%" height="600" frameborder="0" allowfullscreen style="border-radius: 8px;"></iframe>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load TikTok users:', err);
    document.getElementById('tiktok-users-list').innerHTML = '<li>Error loading users</li>';
  }
}

async function loadLogDates() {
  try {
    const data = await fetchAPI('/api/log-dates');
    const select = document.getElementById('log-date');
    select.innerHTML = '<option value="">Select date...</option>';

    data.dates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load log dates:', err);
  }
}

async function loadLogs() {
  const select = document.getElementById('log-date');
  const date = select.value;
  const logContent = document.getElementById('log-content');

  if (!date) {
    logContent.textContent = 'Select a date to view logs';
    return;
  }

  try {
    const content = await fetchText(`/api/logs?date=${date}`);
    logContent.textContent = content;
  } catch (err) {
    console.error('Failed to load logs:', err);
    logContent.textContent = `Error loading logs: ${err.message}`;
  }
}

async function loadSystemInfo() {
  try {
    const sys = await fetchAPI('/api/system');

    document.getElementById('cpu-usage').textContent = `${sys.cpu.usagePercent}%`;
    document.getElementById('mem-usage').textContent = `${sys.memory.usagePercent}%`;
    document.getElementById('uptime').textContent = formatUptime(sys.uptime);

    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    systemHistory.push({
      time: timestamp,
      cpu: sys.cpu.usagePercent,
      memory: sys.memory.usagePercent
    });

    if (systemHistory.length > MAX_HISTORY_POINTS) {
      systemHistory.shift();
    }

    updateSystemChart();

  } catch (err) {
    console.error('Failed to load system info:', err);
  }
}

function updateSystemChart() {
  const ctx = document.getElementById('system-chart').getContext('2d');

  if (window.systemChart) {
    const labels = systemHistory.map(d => d.time);
    const cpuData = systemHistory.map(d => d.cpu);
    const memData = systemHistory.map(d => d.memory);

    window.systemChart.data.labels = labels;
    window.systemChart.data.datasets[0].data = cpuData;
    window.systemChart.data.datasets[1].data = memData;
    window.systemChart.update('none'); 
  } else {

    const labels = systemHistory.map(d => d.time);
    const cpuData = systemHistory.map(d => d.cpu);
    const memData = systemHistory.map(d => d.memory);
    window.systemChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'CPU Usage (%)',
          data: cpuData,
          borderColor: '#ff6384',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#ff6384',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }, {
          label: 'Memory Usage (%)',
          data: memData,
          borderColor: '#36a2eb',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          borderWidth: 2,
          tension: 0.1,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#36a2eb',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        animation: {
          duration: 0 
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(200, 200, 200, 0.3)'
            },
            title: {
              display: true,
              text: 'Usage (%)'
            }
          },
          x: {
            grid: {
              color: 'rgba(200, 200, 200, 0.3)'
            },
            title: {
              display: true,
              text: 'Time'
            }
          }
        },
        plugins: {
          legend: {
            position: 'top'
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

let autoRefreshInterval = null;
let dayChart, hourChart;

async function loadAnalytics() {
  try {
    const analytics = await fetchAPI('/api/analytics');
    
    // Update summary values
    document.getElementById('total-streams').textContent = analytics.totalStreams;
    
    const totalHours = Math.floor(analytics.totalStreamTime / (1000 * 3600));
    document.getElementById('total-time').textContent = `${totalHours}h`;
    
    const avgMinutes = Math.floor(analytics.averageDuration / (1000 * 60));
    document.getElementById('avg-stream-duration').textContent = `${avgMinutes}m`;
    
    // Longest stream
    if (analytics.longestStream && analytics.longestStream.userId) {
      const duration = Math.floor(analytics.longestStream.duration / (1000 * 60));
      const date = new Date(analytics.longestStream.date).toLocaleDateString();
      document.getElementById('longest-stream').textContent = 
        `${analytics.longestStream.userId} - ${duration}m (${date})`;
    } else {
      document.getElementById('longest-stream').textContent = '-';
    }
    
    // Most active streamer
    if (analytics.mostActiveStreamer && analytics.mostActiveStreamer.userId) {
      document.getElementById('most-active-streamer').textContent = 
        `${analytics.mostActiveStreamer.userId} (${analytics.mostActiveStreamer.count} streams)`;
    } else {
      document.getElementById('most-active-streamer').textContent = '-';
    }
    
    // Day of week chart
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayData = daysOfWeek.map(day => analytics.streamsByDay[day] || 0);
    
    if (dayChart) {
      dayChart.data.datasets[0].data = dayData;
      dayChart.update();
    } else {
      const dayCtx = document.getElementById('day-chart').getContext('2d');
      dayChart = new Chart(dayCtx, {
        type: 'bar',
        data: {
          labels: daysOfWeek,
          datasets: [{
            label: 'Streams',
            data: dayData,
            backgroundColor: '#007bff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }
    
    // Hour of day chart
    const hourLabels = Array.from({length: 24}, (_, i) => `${i}:00`);
    const hourData = Array.from({length: 24}, (_, i) => analytics.streamsByHour[i] || 0);
    
    if (hourChart) {
      hourChart.data.datasets[0].data = hourData;
      hourChart.update();
    } else {
      const hourCtx = document.getElementById('hour-chart').getContext('2d');
      hourChart = new Chart(hourCtx, {
        type: 'line',
        data: {
          labels: hourLabels,
          datasets: [{
            label: 'Streams',
            data: hourData,
            borderColor: '#28a745',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    }
  } catch (err) {
    console.error('Failed to load analytics:', err);
  }
}

function startAutoRefresh(interval = 2000) {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    loadSummary();
    loadStats();
    loadLiveStreams();
    loadLiveHistory();
    loadSystemInfo();
    loadAnalytics();
  }, interval);
}

function changeUpdateInterval() {
  const select = document.getElementById('update-interval');
  const interval = parseInt(select.value);

  systemHistory = [];
  systemHistory.push({
    time: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    cpu: 0,
    memory: 0
  });
  updateSystemChart();

  startAutoRefresh(interval);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSummary();
  loadStats();
  loadLiveStreams();
  loadLiveHistory();
  loadTikTokUsers();
  loadLogDates();
  loadSystemInfo();
  loadAnalytics();
  updateSystemChart();
  startAutoRefresh();

  document.getElementById('update-interval').addEventListener('change', changeUpdateInterval);

  document.getElementById('log-date').addEventListener('change', loadLogs);
});