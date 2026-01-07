# 🐺 Wolf TCG Discord Bot

A sophisticated Discord bot that monitors Twitch streams using the Euler API Free Plan. It automatically detects when specified users go live or offline, sending rich embed notifications to a designated Discord channel. Includes a web dashboard for real-time monitoring and management.

## ✨ Features

- **Live Stream Monitoring**: Automatically checks stream status every 90 seconds to stay under the 1000 daily API request limit.
- **Rich Embeds**: Sends beautifully formatted Discord embeds for live notifications and stream end alerts.
- **Owner Notifications**: Direct messages the bot owner with important updates, warnings, and alerts.
- **Rate Limiting**: Built-in API request tracking with warnings at 900 requests and hard stop at 1000.
- **Persistent State**: Remembers sent messages, stream start times, and user data across restarts.
- **Web Dashboard**: Comprehensive monitoring interface with live stats, logs, and charts.
- **Logging**: Detailed event logging with daily log files.
- **Error Handling**: Robust reconnection logic and graceful failure handling.

## 📋 Prerequisites

- Node.js (v16 or higher)
- A Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Euler API Key (from [Euler Stream](https://www.eulerstream.com/))
- Discord Server with appropriate permissions

## 🚀 Installation

1. **Clone or Download** the bot files to your local machine.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (see Configuration section below).

4. **Run the Bot**:
   ```bash
   npm start
   ```

## ⚙️ Configuration

Copy `.env.example` to `.env` and fill in your actual values:

```bash
cp .env.example .env
```

Then edit the `.env` file with the following variables:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token_here
EULER_API_KEY=your_euler_api_key_here
ALERT_CHANNEL_ID=your_discord_channel_id_here
OWNER_ID=your_discord_user_id_here
TIKTOK_USERS=username1,username2,username3

# Optional
DEBUG_LOGS=true
MAX_RECONNECT_ATTEMPTS=4
DASHBOARD_PORT=3000
DASHBOARD_USER=admin
DASHBOARD_PASS=your_secure_password
```

### Getting Your Tokens and IDs

- **DISCORD_TOKEN**: Create a bot at [Discord Developer Portal](https://discord.com/developers/applications), go to Bot section, and copy the token.
- **EULER_API_KEY**: Sign up at [Euler Stream](https://www.eulerstream.com/) and get your free API key.
- **ALERT_CHANNEL_ID**: Right-click a channel in Discord → Copy ID (requires Developer Mode enabled).
- **OWNER_ID**: Right-click your username in Discord → Copy ID.
- **TIKTOK_USERS**: Comma-separated list of Twitch usernames to monitor.

## 🎮 Running the Bot

### Basic Usage
```bash
# Start the bot
npm start

# Development mode (with auto-restart)
npm run dev
```

### Web Dashboard
```bash
# Start the dashboard server
npm run dashboard
```

Then open `http://localhost:3000` in your browser.

## 🖥️ Web Dashboard

The included web dashboard provides real-time monitoring and management:

### Features
- **Summary Panel**: Live stream count, total monitored users, and daily API usage
- **Live Streams List**: Currently active streams with titles and durations
- **Request Usage Chart**: Visual representation of API requests used vs remaining
- **Log Viewer**: Browse and view log files by date
- **System Information**: CPU usage, memory stats, and uptime

### Security
The dashboard supports basic authentication. Set `DASHBOARD_USER` and `DASHBOARD_PASS` in your `.env` file for access control.

## 🔌 API Endpoints

The dashboard exposes several API endpoints for external integration:

- `GET /api/summary` - Bot summary statistics
- `GET /api/state` - Complete stream state data
- `GET /api/requests` - API request counter information
- `GET /api/logs?date=YYYY-MM-DD` - Log content for specific date
- `GET /api/log-dates` - Available log file dates
- `GET /api/system` - System performance metrics
- `GET /api/tiktok-users` - List of monitored users

## 📸 Screenshots

### Live Notification Embed
Automatically detects when a user goes live and sends a rich embed to your channel.

<img width="533" height="691" alt="image" src="https://github.com/user-attachments/assets/7978aa0e-2995-4cdf-84cf-fe4c7e2b4a7c" />


### Stream Ended Embed
Updates automatically after failed connection attempts.

<img width="395" height="611" alt="image" src="https://github.com/user-attachments/assets/141e12d0-c22b-4828-917f-3fd12c29f56c" />


### Owner DM Notifications
The bot DMs you with important alerts and status updates.

<img width="533" height="465" alt="image" src="https://github.com/user-attachments/assets/920d4382-5bb4-4471-8610-8314ba2a906e" />


## 🔧 Troubleshooting

### Common Issues

**Bot does't send any messages:**
- Ensure the bot has been invited to your server with the correct permissions.
- Check that `ALERT_CHANNEL_ID` is correct and the bot can send messages there.

**API request limit reached:**
- The bot automatically stops making requests after 1000/day.
- Limits reset at 00:00 UTC.
- Monitor usage via the dashboard or logs.

**Dashboard not loading:**
- Ensure the dashboard server is running (`npm run dashboard`).
- Check `DASHBOARD_PORT` in `.env` (default: 3000).
- Verify firewall/antivirus isn't blocking the port.

**Connection errors:**
- Check your internet connection.
- Verify Euler API key is valid and active.
- Review logs for specific error messages.

### Logs
All events are logged to daily files in the `logs/` directory. Check these for detailed error information.

## 📄 License

ISC License - Feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## 📞 Support

If you encounter issues:
1. Check the logs in `logs/wolf_tcg_log_YYYY-MM-DD.txt`
2. Verify your `.env` configuration
3. Ensure all prerequisites are met
4. Open an issue with relevant log excerpts

