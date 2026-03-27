#  Wolf TCG Discord Bot

![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-16%2B-green.svg)
![Discord.js](https://img.shields.io/badge/discord.js-14.24.2-5865F2.svg)

A sophisticated Discord bot that monitors TikTok streams using the Euler API Free Plan. It automatically detects when specified users go live or offline, sending rich embed notifications to a designated Discord channel.
---
**TEMPORARY CHANGE (March 2026):**
- The live and offline viewer counters have been removed from Discord embeds due to lack of real-time updates from the upstream service. Embeds will not display current or peak viewers until reliable updates are available again.
- The offline timeout logic (which marks a user offline if no live update is received for 120 seconds) is temporarily disabled to prevent false offline alerts when the user is still live. The bot will not mark a user offline due to missing updates until this logic is re-enabled.

##  Features

- **Live Stream Monitoring**: Automatically checks stream status every 90 seconds (configurable) to stay under the 1000 daily API request limit.
- **Viewer Count Tracking**: Displays current viewers and peak viewers in live embeds, and peak viewers in offline summaries.
- **Live Embed Updates**: Automatically refreshes the live embed every 10 seconds with updated viewer counts and timestamps.
- **Slash Commands**: `/status` to see who's live, `/history` to view recent streams, `/uptime` to check bot status and API usage.
- **Smart Offline Detection**: Only counts reconnection attempts (max 4) when verifying if a live user went offline, unlimited checks when monitoring for users going live.
- **Flicker Protection**: Ignores rapid offline/online transitions within a configurable cooldown (default 2 minutes), preventing duplicate live alerts from connection instability.
- **Ping Suppression**: When a stream ends, the original `@everyone` live message is deleted and replaced with a clean offline embed, removing the stale ping.
- **Rich Embeds**: Sends beautifully formatted Discord embeds for live notifications and stream end alerts.
- **Owner Notifications**: Direct messages the bot owner with important updates, warnings, and alerts.
- **Rate Limiting**: Built-in API request tracking with warnings at 900 requests and hard stop at 1000.
- **Persistent State**: Remembers sent messages, stream start times, and user data across restarts.
- **Graceful Shutdown**: Catches `SIGINT`/`SIGTERM` signals, saves all state, closes WebSockets, and exits cleanly. Safe for `Ctrl+C` and pm2 restarts.
- **Daily Log Rotation**: Log files automatically rotate at midnight without requiring a restart.
- **Automatic Log Cleanup**: Automatically deletes log files older than 3 days to save disk space.
- **Enhanced Logging**: Detailed event logging with daily log files, includes API request counter in all log messages.
- **Testing Tools**: Built-in alert testing system to verify all notifications work correctly.
- **Error Handling**: Robust reconnection logic and graceful failure handling.


**TEMPORARY CHANGE (March 2026):**
- The live and offline viewer counters have been removed from Discord embeds due to lack of real-time updates from the upstream service. Embeds will not display current or peak viewers until reliable updates are available again.

##  Prerequisites

- Node.js (v16 or higher)
- A Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Euler API Key (from [Euler Stream](https://www.eulerstream.com/))
- Discord Server with appropriate permissions

##  Installation

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

##  Configuration

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
MAX_RECONNECT_ATTEMPTS=4
FLICKER_COOLDOWN_MS=120000
RECONNECT_DELAY_MS=90000
```

### Getting Your Tokens and IDs

- **DISCORD_TOKEN**: Create a bot at [Discord Developer Portal](https://discord.com/developers/applications), go to Bot section, and copy the token.
- **EULER_API_KEY**: Sign up at [Euler Stream](https://www.eulerstream.com/) and get your free API key.
- **ALERT_CHANNEL_ID**: Right-click a channel in Discord → Copy ID (requires Developer Mode enabled).
- **OWNER_ID**: Right-click your username in Discord → Copy ID.
- **TIKTOK_USERS**: Comma-separated list of TikTok usernames to monitor.

##  Running the Bot

### Basic Usage
```bash
# Start the bot
npm start

# Development mode (with auto-restart)
npm run dev

# Test all alerts and notifications
npm run test-alerts
```

##  Testing

Test all bot alerts and notifications without waiting for live streams:

```bash
npm run test-alerts
```

This will send test versions of:
- Live stream alerts to your Discord channel
- Offline stream alerts to your Discord channel
- Bot startup DM to owner
- Live notification DM to owner
- API warning DM to owner
- Connection issue DM to owner

All test messages are clearly marked as "TEST MODE".

### Stream Ended Embed
Updates automatically after failed connection attempts.

<img width="395" height="611" alt="image" src="https://github.com/user-attachments/assets/141e12d0-c22b-4828-917f-3fd12c29f56c" />


### Owner DM Notifications
The bot DMs you with important alerts and status updates.

<img width="533" height="465" alt="image" src="https://github.com/user-attachments/assets/920d4382-5bb4-4471-8610-8314ba2a906e" />


##  Troubleshooting

### Common Issues

**Bot doesn't send any messages:**
- Ensure the bot has been invited to your server with the correct permissions.
- Check that `ALERT_CHANNEL_ID` is correct and the bot can send messages there.
- Run `npm run test-alerts` to verify notifications are working.

**API request limit reached:**
- The bot automatically stops making requests after 1000/day.
- Limits reset at 00:00 UTC.
- Monitor usage via the bot logs.

**Connection errors:**
- Check your internet connection.
- Verify Euler API key is valid and active.
- Review logs for specific error messages.

### Logs
All events are logged to daily files in the `logs/` directory. Log files older than 3 days are automatically deleted. Check these for detailed error information.

##  License

ISC License - Feel free to use and modify as needed.

##  Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

##  Support

If you encounter issues:
1. Check the logs in `logs/wolf_tcg_log_YYYY-MM-DD.txt`
2. Verify your `.env` configuration
3. Ensure all prerequisites are met
4. Open an issue with relevant log excerpts

##  Changes & Deployment (updated 2026-03-08)

v1.3.0 changes:
- Added **flicker protection** to prevent duplicate live alerts from rapid offline/online transitions.
- Added **graceful shutdown** — bot now saves state and closes connections cleanly on `SIGINT`/`SIGTERM`.
- Added **daily log rotation** — log files rotate at midnight automatically without restart.
- Added **ping suppression** — offline events now delete the original `@everyone` message and post a clean offline embed.
- Added configurable `FLICKER_COOLDOWN_MS` environment variable (default: 120000ms / 2 minutes).

Previous changes:
- Removed Docker artifacts (`Dockerfile`, `docker-compose.yml`, `.dockerignore`) to focus on running the bot directly in a host/container environment.
- Restored file-based logging in the application while adding a safe fallback to console-only logging if file writes fail.

If you're running the bot inside a Debian container on Proxmox (recommended):

1. Install Node.js and dependencies:
```bash
apt update
apt install -y curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
cd /opt/wolf-bot   # or wherever you placed the repo
npm ci
```

2. Secure your environment file and create state files:
```bash
chmod 600 /opt/wolf-bot/.env
touch /opt/wolf-bot/stream_state.json /opt/wolf-bot/request_counter.json
chmod 664 /opt/wolf-bot/*.json
```

3. Run the bot (foreground):
```bash
npm start
```

4. Run the bot with `pm2` (recommended for production):
```bash
npm install -g pm2
pm2 start index.js --name WolfTCG
pm2 logs WolfTCG
pm2 save
pm2 startup systemd  # follow the printed instructions
```

Systemd unit example (alternative to pm2):
```ini
[Unit]
Description=WolfTCG Bot
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wolf-bot
ExecStart=/usr/bin/node /opt/wolf-bot/index.js
Restart=always
EnvironmentFile=/opt/wolf-bot/.env

[Install]
WantedBy=multi-user.target
```


