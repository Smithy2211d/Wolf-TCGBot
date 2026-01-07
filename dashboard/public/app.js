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

// Store historical system data
let systemHistory = [];
const MAX_HISTORY_POINTS = 150;

// Initialize with empty data point to ensure chart is created
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

    // Update or create chart
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

async function loadTikTokUsers() {
  try {
    const data = await fetchAPI('/api/tiktok-users');
    const list = document.getElementById('tiktok-users-list');
    list.innerHTML = '';

    if (data.users.length === 0) {
      list.innerHTML = '<li>No TikTok users configured</li>';
      return;
    }

    data.users.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${user}</strong><br>
        <a href="https://www.tiktok.com/@${user}" target="_blank">View Profile</a>
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
    document.getElementById('hostname').textContent = sys.hostname;
    document.getElementById('platform').textContent = `${sys.platform} ${sys.arch}`;
    document.getElementById('cpu-cores').textContent = sys.cpu.cores;
    document.getElementById('memory-info').textContent =
      `${formatBytes(sys.memory.used)} / ${formatBytes(sys.memory.total)}`;

    // Update last updated timestamp
    const now = new Date();
    document.getElementById('last-updated').textContent = now.toLocaleTimeString();

    // Store historical data
    const timestamp = now.toLocaleTimeString('en-US', {
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

    // Keep only last MAX_HISTORY_POINTS
    if (systemHistory.length > MAX_HISTORY_POINTS) {
      systemHistory.shift();
    }

    // Update or create system chart
    updateSystemChart();

  } catch (err) {
    console.error('Failed to load system info:', err);
  }
}

function updateSystemChart() {
  const ctx = document.getElementById('system-chart').getContext('2d');

  if (window.systemChart) {
    // Update existing chart data smoothly
    const labels = systemHistory.map(d => d.time);
    const cpuData = systemHistory.map(d => d.cpu);
    const memData = systemHistory.map(d => d.memory);

    window.systemChart.data.labels = labels;
    window.systemChart.data.datasets[0].data = cpuData;
    window.systemChart.data.datasets[1].data = memData;
    window.systemChart.update('none'); // Update without animation for smooth real-time feel
  } else {
    // Create new chart if it doesn't exist
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
          duration: 0 // Disable animations for real-time feel
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

// Auto-refresh every 2 seconds for real-time updates
let autoRefreshInterval = null;

function startAutoRefresh(interval = 2000) {
  // Clear existing interval if any
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    loadSummary();
    loadLiveStreams();
    loadSystemInfo();
  }, interval);
}

function changeUpdateInterval() {
  const select = document.getElementById('update-interval');
  const interval = parseInt(select.value);

  // Reset system history for fresh data at new interval
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

  // Update the chart with reset data
  updateSystemChart();

  // Start auto-refresh with new interval
  startAutoRefresh(interval);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSummary();
  loadLiveStreams();
  loadTikTokUsers();
  loadLogDates();
  loadSystemInfo();
  // Create system chart immediately
  updateSystemChart();
  startAutoRefresh();

  // Add event listener for interval change
  document.getElementById('update-interval').addEventListener('change', changeUpdateInterval);

  // Add event listener for log date selection
  document.getElementById('log-date').addEventListener('change', loadLogs);
});