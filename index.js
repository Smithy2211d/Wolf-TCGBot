import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import dotenv from "dotenv";
import WebSocket from "ws";
import fs, { readFileSync, existsSync, writeFileSync } from "fs";
import chalk from "chalk";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  try {
    const envBuffer = readFileSync(new URL("./.env", import.meta.url));
    const parsed = dotenv.parse(envBuffer);
    for (const [key, value] of Object.entries(parsed)) process.env[key] = value;
  } catch {
    console.warn("⚠️ .env not found. Make sure environment variables are set!");
  }
}

const apiKey = process.env.EULER_API_KEY;
const alertChannelId = process.env.ALERT_CHANNEL_ID;
const ownerId = process.env.OWNER_ID;
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "4", 10);
const FLICKER_COOLDOWN_MS = parseInt(process.env.FLICKER_COOLDOWN_MS || "120000", 10);
const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || "90000", 10);
const guildId = process.env.GUILD_ID;

const tikTokUsers = (process.env.TIKTOK_USERS || "")
  .split(",")
  .map((u) => u.trim())
  .filter((u) => u);

if (!apiKey || !process.env.DISCORD_TOKEN) {
  console.error("❌ Missing required .env variables!");
  process.exit(1);
}
if (tikTokUsers.length === 0) {
  console.error("❌ No TikTok usernames found.");
  process.exit(1);
}

const logsDir = path.join(__dirname, "logs");
let fileLoggingEnabled = false;
let logPath = null;

function cleanupOldLogs() {
  try {
    if (!existsSync(logsDir)) return;
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    files.forEach((file) => {
      if (file.startsWith("wolf_tcg_log_") && file.endsWith(".txt")) {
        const filePath = path.join(logsDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.mtimeMs < threeDaysAgo) {
            fs.unlinkSync(filePath);
            console.log(chalk.gray(`🗑️ Deleted old log file: ${file}`));
          }
        } catch (err) {
        }
      }
    });
  } catch (err) {
    console.warn(chalk.yellow(`⚠️ Error during log cleanup: ${err.message}`));
  }
}

try {
  if (!existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  const currentLogDate = new Date().toISOString().slice(0, 10);
  logPath = path.join(logsDir, `wolf_tcg_log_${currentLogDate}.txt`);
  if (!existsSync(logPath)) {
    const header = `──────────────────────────────\n🐺 Wolf TCG Bot Log — ${currentLogDate}\n──────────────────────────────\n`;
    fs.writeFileSync(logPath, header, "utf8");
  }
  fileLoggingEnabled = true;
} catch (err) {
  fileLoggingEnabled = false;
  console.warn(chalk.yellow(`⚠️ File logging disabled: ${err.message}`));
}

function logEvent(message, color = "white") {
  
  const currentDate = new Date().toISOString().slice(0, 10);
  const expectedLogPath = path.join(logsDir, `wolf_tcg_log_${currentDate}.txt`);
  if (fileLoggingEnabled && logPath !== expectedLogPath) {
    logPath = expectedLogPath;
    if (!existsSync(logPath)) {
      const header = `──────────────────────────────\n🐺 Wolf TCG Bot Log — ${currentDate}\n──────────────────────────────\n`;
      fs.writeFileSync(logPath, header, "utf8");
    }
    cleanupOldLogs();
  }

  const timestamp = new Date().toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const colorMap = {
    green: chalk.green,
    red: chalk.red,
    yellow: chalk.yellow,
    blue: chalk.cyan,
    gray: chalk.gray,
    white: chalk.white,
  };
  const out = `[${timestamp}] ${message}`;
  console.log(colorMap[color] ? colorMap[color](out) : out);

  if (!fileLoggingEnabled || !logPath) return;
  try {
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, "utf8");
  } catch (err) {
    fileLoggingEnabled = false;
    console.warn(chalk.yellow(`⚠️ Disabling file logging: ${err.message}`));
  }
}

const REQUEST_LIMIT = 1000;
const WARNING_THRESHOLD = 900;
const requestCounterFile = path.join(__dirname, "request_counter.json");

let requestState = { date: new Date().toISOString().slice(0, 10), count: 0 };

if (existsSync(requestCounterFile)) {
  try {
    requestState = JSON.parse(readFileSync(requestCounterFile, "utf8"));
  } catch {
    logEvent("⚠️ Failed to read request_counter.json, resetting counter.", "yellow");
  }
}

function saveRequestState() {
  writeFileSync(requestCounterFile, JSON.stringify(requestState, null, 2), "utf8");
}

function resetRequestCounterIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (requestState.date !== today) {
    requestState = { date: today, count: 0 };
    saveRequestState();
    logEvent(`🕛 Request counter reset for new day (${today})`, "gray");
  }
}

function canMakeRequest() {
  resetRequestCounterIfNewDay();
  return requestState.count < REQUEST_LIMIT;
}

async function recordRequest() {
  requestState.count++;
  saveRequestState();

  if (requestState.count % 100 === 0) {
    logEvent(`📊 ${requestState.count}/${REQUEST_LIMIT} requests used today.`, "gray");
  }

  if (requestState.count === WARNING_THRESHOLD) {
    await notifyOwner(
      `⚠️ You've reached **${WARNING_THRESHOLD}/${REQUEST_LIMIT}** API requests for today.`,
      "warn"
    );
  }

  if (requestState.count === REQUEST_LIMIT) {
    await notifyOwner(
      `🚫 **Daily API request limit (${REQUEST_LIMIT}) reached!** No new connections will be made until reset.`,
      "error"
    );
  }
}

const stateFile = path.join(__dirname, "stream_state.json");
let persistentState = { 
  sentMessages: {}, 
  streamStartTimes: {}, 
  liveStatus: {}, 
  userCache: {}, 
  titleCache: {}, 
  liveHistory: []
};
if (existsSync(stateFile)) {
  try {
    persistentState = JSON.parse(readFileSync(stateFile, "utf8"));
    logEvent("💾 Loaded previous stream state.", "gray");
  } catch {
    logEvent("⚠️ Failed to load stream_state.json, starting fresh.", "yellow");
  }
}
const sentMessages = persistentState.sentMessages;
const streamStartTimes = persistentState.streamStartTimes;
const liveStatus = persistentState.liveStatus;
const userCache = persistentState.userCache || {};
const titleCache = persistentState.titleCache || {};
const liveHistory = persistentState.liveHistory || [];
persistentState.userCache = userCache;
persistentState.titleCache = titleCache;
persistentState.liveHistory = liveHistory;

{
  const now = Date.now();
  let orphansClosed = 0;
  for (const entry of liveHistory) {
    if (entry.endTime === null) {
      entry.endTime = now;
      orphansClosed++;
    }
  }
  if (orphansClosed > 0) {
    logEvent(`🔧 Closed ${orphansClosed} orphaned liveHistory entries from previous run.`, "yellow");
  }
}

const MAX_HISTORY = 50;
if (liveHistory.length > MAX_HISTORY) {
  const removed = liveHistory.length - MAX_HISTORY;
  liveHistory.splice(0, removed);
  logEvent(`🗑️ Trimmed ${removed} old liveHistory entries (capped at ${MAX_HISTORY}).`, "gray");
}

function saveState() {
  if (liveHistory.length > MAX_HISTORY) {
    liveHistory.splice(0, liveHistory.length - MAX_HISTORY);
  }
  writeFileSync(stateFile, JSON.stringify(persistentState, null, 2), "utf8");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});

const commands = [
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check who is currently live"),
  new SlashCommandBuilder()
    .setName("history")
    .setDescription("View recent stream history")
    .addIntegerOption(opt =>
      opt.setName("count").setDescription("Number of entries to show (default: 5)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Check bot uptime and API usage"),
];

let ownerUser = null;
async function notifyOwner(message, type = "info") {
  if (!ownerId) return;
  try {
    if (!ownerUser) ownerUser = await client.users.fetch(ownerId);

    const colorMap = {
      info: 0x5865f2,
      success: 0x57f287,
      warn: 0xfee75c,
      error: 0xed4245,
      live: 0xff0000,
      offline: 0x57f287,
    };
    const color = colorMap[type] || 0x5865f2;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle("🐺 Wolf TCG Bot Notice")
      .setDescription(message)
      .setFooter({ text: `Sent ${new Date().toLocaleString("en-GB")}` });

    await ownerUser.send({ embeds: [embed] });
  } catch (err) {
    logEvent(`⚠️ Failed to DM owner: ${err.message}`, "red");
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function buildLiveEmbed({ userId, room, user }) {
  const now = Date.now();
  const startMs = (room.startTime ?? Math.floor(now / 1000)) * 1000;
  const startUnix = Math.floor(startMs / 1000);
  const lastUpdateUnix = Math.floor(now / 1000);
  const startFormatted = new Date(startMs).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const streamTitle = room?.title?.trim() ? `🎬 **${room.title}**` : "🎬 **No title**";
  const currentViewers = viewerCounts[userId] || 0;
  const peak = peakViewers[userId] || 0;

  return new EmbedBuilder()
    .setColor(0xff0000)
    .setAuthor({
      name: `${user?.uniqueId || userId}`,
      iconURL: user?.avatarUrl || "https://i.imgur.com/AfFp7pu.png",
      url: `https://www.tiktok.com/@${userId}`,
    })
    .setTitle(`${user?.uniqueId || userId}'s stream is LIVE!`)
    .addFields(
      { name: "Status", value: "🔴 Live Now!", inline: true },
      { name: "Viewers", value: `👀 **${currentViewers.toLocaleString()}** (Peak: **${peak.toLocaleString()}**)`, inline: true },
      { name: "Title", value: streamTitle, inline: false },
      {
        name: "Stream Info",
        value: `🕒 **Started:** ${startFormatted}\n🔴 **Live Since:** <t:${startUnix}:R>\n🕓 **Last Updated:** <t:${lastUpdateUnix}:R>`,
        inline: false,
      }
    )
    .setImage(room?.coverUrl || user?.avatarUrl)
    .setFooter({ text: "Wolf TCG Alerts" })
    .setTimestamp();
}

function buildOfflineEmbed({ userId, startMs, endMs, room, user }) {
  const duration = formatDuration((endMs ?? Date.now()) - (startMs ?? Date.now()));
  const startUnix = Math.floor(startMs / 1000);
  const endUnix = Math.floor(endMs / 1000);
  const rememberedTitle = room?.title?.trim() || titleCache[userId];
  const streamTitle = rememberedTitle ? `🎬 **${rememberedTitle}**` : "🎬 **No title**";
  const peak = peakViewers[userId] || 0;

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: `${user?.uniqueId || userId}`,
      iconURL: user?.avatarUrl || "https://i.imgur.com/AfFp7pu.png",
      url: `https://www.tiktok.com/@${userId}`,
    })
    .setTitle(`${user?.uniqueId || userId}'s stream has ended.`)
    .addFields(
      { name: "Status", value: "🟢 Stream Ended", inline: true },
      { name: "Peak Viewers", value: `👀 **${peak.toLocaleString()}**`, inline: true },
      { name: "Title", value: streamTitle, inline: false },
      {
        name: "Stream Info",
        value:
          `🕒 **Started:** <t:${startUnix}:f>\n` +
          `✅ **Ended:** <t:${endUnix}:f>\n` +
          `⏱️ **Duration:** ${duration}\n`,
        inline: false,
      }
    )
    .setImage(user?.avatarUrl || room?.coverUrl || userCache[userId]?.coverUrl || "https://i.imgur.com/AfFp7pu.png")
    .setFooter({ text: "Wolf TCG Alerts" })
    .setTimestamp(endMs);
}

function liveActionRow(userId, isLive) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(isLive ? "🔴 Watch Live" : "⚪ Offline")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://www.tiktok.com/@${userId}`)
  );
}

const userConnections = {};
const failedReconnects = {};
const lastLiveUpdate = {};
const lastOfflineTime = {};
const viewerCounts = {};
const peakViewers = {};
const OFFLINE_TIMEOUT_MS = 2 * 60 * 1000;
const EMBED_UPDATE_INTERVAL_MS = 10 * 1000;
const botStartTime = Date.now();

async function connectEulerWSForUser(username) {
  resetRequestCounterIfNewDay();

  if (!canMakeRequest()) {
    logEvent(`🚫 Daily API request limit (${REQUEST_LIMIT}) reached. Skipping ${username}.`, "red");
    await notifyOwner(`⚠️ Request limit (${REQUEST_LIMIT}) reached — skipping connection for ${username}.`, "warn");
    return;
  }

  await recordRequest();
  if (requestState.count > REQUEST_LIMIT) return;

  if (userConnections[username]) {
    try {
      userConnections[username].terminate();
    } catch {}
  }
  const ws = new WebSocket(`wss://ws.eulerstream.com?uniqueId=${username}&apiKey=${apiKey}`);
  userConnections[username] = ws;

  const reconnectDelay = RECONNECT_DELAY_MS;

  ws.on("open", async () => {
    logEvent(`🟢 Connected to EulerStream for ${username} | API: ${requestState.count}/${REQUEST_LIMIT}`, "green");

  });

  ws.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!data?.messages?.length) return;

    for (const msg of data.messages) {
      if (msg.type !== "roomInfo") continue;
      const room = msg.data?.roomInfo;
      const user = msg.data?.user;
      if (!room || !user) continue;

      const userId = username;
      const now = Date.now();
      const wasLive = !!liveStatus[userId];

      // DEBUG: Log every roomInfo message received
      logEvent(`[DEBUG] Received roomInfo for ${userId}: isLive=${room.isLive}, now=${now}`);

      if (room.isLive || !wasLive) {
        const previousAttempts = failedReconnects[username] || 0;
        if (previousAttempts > 0) {
          logEvent(`✅ [${username}] Connection restored — reset counter (was ${previousAttempts}/${MAX_RECONNECT_ATTEMPTS})`, "green");
        }
        failedReconnects[username] = 0;
      }

      if (room.isLive) {
        lastLiveUpdate[userId] = now;
        // DEBUG: Log when lastLiveUpdate is set
        logEvent(`[DEBUG] Updated lastLiveUpdate for ${userId}: ${now}`);
        // DEBUG: Log the raw room object and viewer count fields
        logEvent(`[DEBUG] Raw room object for ${userId}: ${JSON.stringify(room)}`);
        const viewers = room.userCount || room.viewerCount || room.totalViewers || 0;
        logEvent(`[DEBUG] Extracted viewers for ${userId}: userCount=${room.userCount}, viewerCount=${room.viewerCount}, totalViewers=${room.totalViewers}, used=${viewers}`);
        viewerCounts[userId] = viewers;
        if (viewers > (peakViewers[userId] || 0)) {
          peakViewers[userId] = viewers;
        }
      }

      if (room.isLive && !wasLive) {

        const lastOff = lastOfflineTime[userId] || 0;
        if (lastOff > 0 && now - lastOff < FLICKER_COOLDOWN_MS) {
          logEvent(`⏳ [${username}] Ignoring live event — flicker cooldown (${Math.round((FLICKER_COOLDOWN_MS - (now - lastOff)) / 1000)}s remaining)`, "yellow");
          liveStatus[userId] = true;
          lastLiveUpdate[userId] = now;
          continue;
        }

        const streamStart = (room.startTime ?? Math.floor(now / 1000)) * 1000;
        const detectedMs = now - streamStart;

        if (detectedMs <= 30 * 1000) {
          logEvent(`⚡ [${username}] Detected live within 30 seconds`, "green");
        } else {
          logEvent(`🔴 [${username}] Detected live after ${Math.round(detectedMs / 1000)} seconds`, "green");
        }

        liveStatus[userId] = true;
        streamStartTimes[userId] = streamStart;
        userCache[userId] = { uniqueId: user.uniqueId, avatarUrl: user.avatarUrl, coverUrl: room.coverUrl || null };
        if (room.title?.trim()) titleCache[userId] = room.title.trim();
        liveHistory.push({ userId, startTime: streamStart, endTime: null, title: room.title?.trim() || 'No title' });
        saveState();

        try {
          const channel = await client.channels.fetch(alertChannelId);
          const embed = buildLiveEmbed({ userId, room, user });
          const sent = await channel.send({
            content: `@everyone **${userId} is now LIVE!**`,
            embeds: [embed],
            components: [liveActionRow(userId, true)],
          });
          sentMessages[userId] = sent.id;
          logEvent(`📣 [${userId}] Stream started: "${room.title}"`, "green");
          await notifyOwner(`🔴 ${userId} is now LIVE!`, "live");
        } catch (err) {
          logEvent(`❌ Error sending live alert for ${userId}: ${err.message}`, "red");
        }
      }

      if (!room.isLive && wasLive) {
        lastOfflineTime[userId] = now;
        try {
          const channel = await client.channels.fetch(alertChannelId);
          const msgId = sentMessages[userId];
          const startMs = streamStartTimes[userId] || now;
          const embed = buildOfflineEmbed({
            userId,
            startMs,
            endMs: now,
            room,
            user: user.avatarUrl ? user : userCache[userId] || { uniqueId: userId },
          });

          const oldMsg = msgId ? await channel.messages.fetch(msgId).catch(() => null) : null;
          if (oldMsg) await oldMsg.delete().catch(() => null);
          const newMsg = await channel.send({
            content: `**${userId}'s stream has ended.**`,
            embeds: [embed],
            components: [liveActionRow(userId, false)],
          });
          sentMessages[userId] = newMsg.id;
          const historyEntry = liveHistory.find(h => h.userId === userId && h.endTime === null);
          if (historyEntry) {
            historyEntry.endTime = now;
          }
          liveStatus[userId] = false;
          saveState();
          logEvent(`🟢 [${userId}] Offline embed sent (stream ended normally).`, "green");
        } catch (err) {
          logEvent(`❌ Error editing offline embed for ${userId}: ${err.message}`, "red");
        }
      }
    }
  });

  ws.on("close", async (code, reason) => {
    delete userConnections[username];
    const wasLive = !!liveStatus[username];
    
    if (wasLive) {
      failedReconnects[username] = (failedReconnects[username] || 0) + 1;
      const attempt = failedReconnects[username];
      
      logEvent(
        `🔴 [${username}] WS closed (code ${code}) | Offline check attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} | API: ${requestState.count}/${REQUEST_LIMIT} | ${reason?.toString() || "No reason"}`,
        "yellow"
      );
    } else {
      const currentAttempts = failedReconnects[username] || 0;
      logEvent(
        `🔴 [${username}] WS closed (code ${code}) | Live check (${currentAttempts} offline attempts stored) | API: ${requestState.count}/${REQUEST_LIMIT} | Reconnecting in ${RECONNECT_DELAY_MS / 1000}s`,
        "gray"
      );
    }

    const attempt = failedReconnects[username] || 0;

    if (attempt >= MAX_RECONNECT_ATTEMPTS && wasLive) {
      lastOfflineTime[username] = Date.now();
      try {
        const now = Date.now();
        const cachedUser = userCache[username] || { uniqueId: username };
        const startMs = streamStartTimes[username] || now;

        const channel = await client.channels.fetch(alertChannelId);
        const msgId = sentMessages[username];
        const embed = buildOfflineEmbed({
          userId: username,
          startMs,
          endMs: now,
          room: { title: titleCache[username] },
          user: cachedUser,
        });

        const oldMsg = msgId ? await channel.messages.fetch(msgId).catch(() => null) : null;
        if (oldMsg) await oldMsg.delete().catch(() => null);
        const newMsg = await channel.send({
          content: `**${username}'s stream has ended.**`,
          embeds: [embed],
          components: [liveActionRow(username, false)],
        });
        sentMessages[username] = newMsg.id;

        const historyEntry = liveHistory.find(h => h.userId === username && h.endTime === null);
        if (historyEntry) {
          historyEntry.endTime = now;
        }

        liveStatus[username] = false;
        saveState();
        failedReconnects[username] = 0;

        logEvent(`🟠 [${username}] Offline embed sent after ${MAX_RECONNECT_ATTEMPTS} failed reconnects.`, "yellow");
        await notifyOwner(`⚠️ ${username}'s stream marked offline after ${MAX_RECONNECT_ATTEMPTS} failed reconnects.`, "warn");
      } catch (err) {
        logEvent(`❌ [${username}] Failed to send offline embed: ${err.message}`, "red");
      }
    }

    setTimeout(() => connectEulerWSForUser(username), reconnectDelay);
  });

  ws.on("error", (err) => {
    logEvent(`❌ [${username}] WebSocket error: ${err.message}`, "red");
    ws.close();
  });
}

client.once("clientReady", async () => {
  logEvent(`✅ Logged in as ${client.user.tag}`, "blue");

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
        body: commands.map((c) => c.toJSON()),
      });
      logEvent(`📝 Slash commands registered to guild ${guildId}.`, "blue");
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands.map((c) => c.toJSON()),
      });
      logEvent("📝 Slash commands registered globally (may take up to 1 hour).", "blue");
    }
  } catch (err) {
    logEvent(`❌ Failed to register slash commands: ${err.message}`, "red");
  }

  await notifyOwner(`Bot restarted and logged in as **${client.user.tag}** 🚀`, "success");
  tikTokUsers.forEach((u) => {
    liveStatus[u] = false;
    connectEulerWSForUser(u);
  });

  setInterval(async () => {
    for (const userId of Object.keys(liveStatus)) {
      if (!liveStatus[userId]) continue;
      const msgId = sentMessages[userId];
      if (!msgId) continue;
      try {
        const channel = await client.channels.fetch(alertChannelId);
        const msg = await channel.messages.fetch(msgId).catch(() => null);
        if (!msg) continue;
        const cached = userCache[userId] || { uniqueId: userId };
        const startMs = streamStartTimes[userId] || Date.now();
        const room = {
          startTime: Math.floor(startMs / 1000),
          title: titleCache[userId] || "",
          coverUrl: cached.coverUrl || null,
        };
        const embed = buildLiveEmbed({ userId, room, user: cached });
        await msg.edit({ embeds: [embed], components: [liveActionRow(userId, true)] });
      } catch (err) {
        logEvent(`⚠️ [${userId}] Failed to update live embed: ${err.message}`, "yellow");
      }
    }
  }, EMBED_UPDATE_INTERVAL_MS);

  setInterval(async () => {
    const now = Date.now();
    for (const userId of Object.keys(liveStatus)) {
      if (!liveStatus[userId]) continue;
      const last = lastLiveUpdate[userId] || 0;
      if (now - last < OFFLINE_TIMEOUT_MS) continue;

      logEvent(`🔵 [${userId}] No live update for ${OFFLINE_TIMEOUT_MS / 1000}s — marking offline.`, "yellow");
      lastOfflineTime[userId] = now;
      try {
        const channel = await client.channels.fetch(alertChannelId);
        const msgId = sentMessages[userId];
        const startMs = streamStartTimes[userId] || now;
        const embed = buildOfflineEmbed({
          userId,
          startMs,
          endMs: now,
          room: { title: titleCache[userId] },
          user: userCache[userId] || { uniqueId: userId },
        });

        const oldMsg = msgId ? await channel.messages.fetch(msgId).catch(() => null) : null;
        if (oldMsg) await oldMsg.delete().catch(() => null);
        const newMsg = await channel.send({
          content: `**${userId}'s stream has ended.**`,
          embeds: [embed],
          components: [liveActionRow(userId, false)],
        });
        sentMessages[userId] = newMsg.id;
        const historyEntry = liveHistory.find(h => h.userId === userId && h.endTime === null);
        if (historyEntry) {
          historyEntry.endTime = now;
        }
        liveStatus[userId] = false;
        delete lastLiveUpdate[userId];
        saveState();
        // Reconnect to resume live status checking
        setTimeout(() => connectEulerWSForUser(userId), 2000);
      } catch (err) {
        logEvent(`❌ [${userId}] Failed to send offline embed (timeout check): ${err.message}`, "red");
      }
    }
  }, 30 * 1000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "status") {
    const liveUsers = Object.keys(liveStatus).filter((u) => liveStatus[u]);
    if (liveUsers.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🐺 Stream Status")
        .setDescription("No one is currently live.")
        .setFooter({ text: "Wolf TCG Alerts" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    const fields = liveUsers.map((u) => {
      const startMs = streamStartTimes[u] || Date.now();
      const viewers = viewerCounts[u] || 0;
      const peak = peakViewers[u] || 0;
      const title = titleCache[u] || "No title";
      return {
        name: `🔴 ${userCache[u]?.uniqueId || u}`,
        value:
          `**Title:** ${title}\n` +
          `**Viewers:** ${viewers.toLocaleString()} (Peak: ${peak.toLocaleString()})\n` +
          `**Live since:** <t:${Math.floor(startMs / 1000)}:R>\n` +
          `[Watch Live](https://www.tiktok.com/@${u})`,
        inline: false,
      };
    });
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("🐺 Stream Status")
      .addFields(fields)
      .setFooter({ text: "Wolf TCG Alerts" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "history") {
    const count = Math.min(interaction.options.getInteger("count") || 5, 15);
    const recent = liveHistory.slice(-count).reverse();
    if (recent.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🐺 Stream History")
        .setDescription("No stream history recorded yet.")
        .setFooter({ text: "Wolf TCG Alerts" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    const lines = recent.map((h, i) => {
      const start = `<t:${Math.floor(h.startTime / 1000)}:f>`;
      const end = h.endTime ? `<t:${Math.floor(h.endTime / 1000)}:f>` : "🔴 Still Live";
      const dur = h.endTime ? formatDuration(h.endTime - h.startTime) : "Ongoing";
      return `**${i + 1}.** **${h.userId}** — ${h.title || "No title"}\n　　${start} → ${end} (${dur})`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🐺 Stream History")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `Showing ${recent.length} of ${liveHistory.length} entries` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "uptime") {
    const uptime = formatDuration(Date.now() - botStartTime);
    resetRequestCounterIfNewDay();
    const liveCount = Object.keys(liveStatus).filter((u) => liveStatus[u]).length;
    const connectedCount = Object.keys(userConnections).length;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🐺 Bot Status")
      .addFields(
        { name: "Uptime", value: `⏱️ ${uptime}`, inline: true },
        { name: "API Usage", value: `📊 ${requestState.count}/${REQUEST_LIMIT}`, inline: true },
        { name: "Monitoring", value: `👥 ${tikTokUsers.length} users`, inline: true },
        { name: "Live Now", value: `🔴 ${liveCount}`, inline: true },
        { name: "WS Connections", value: `🔌 ${connectedCount}`, inline: true },
        { name: "Reconnect Delay", value: `⏳ ${RECONNECT_DELAY_MS / 1000}s`, inline: true },
      )
      .setFooter({ text: "Wolf TCG Alerts" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }
});

function gracefulShutdown(signal) {
  logEvent(`🛑 Received ${signal} — shutting down gracefully...`, "yellow");
  saveState();
  saveRequestState();
  for (const [username, ws] of Object.entries(userConnections)) {
    try {
      ws.terminate();
      logEvent(`🔌 Closed WebSocket for ${username}`, "gray");
    } catch {}
  }
  client.destroy();
  logEvent("👋 Bot shut down cleanly.", "green");
  process.exit(0);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  logEvent(`⚠️ Unhandled rejection: ${err?.message || err}`, "red");
});

client.login(process.env.DISCORD_TOKEN);