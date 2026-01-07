import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import dotenv from "dotenv";
import WebSocket from "ws";
import fs from "fs";
import chalk from "chalk";
import { readFileSync, existsSync, writeFileSync } from "fs";
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

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";
const apiKey = process.env.EULER_API_KEY;
const alertChannelId = process.env.ALERT_CHANNEL_ID;
const ownerId = process.env.OWNER_ID;
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "4", 10);

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
if (!existsSync(logsDir)) fs.mkdirSync(logsDir);

function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

    files.forEach(file => {
      if (file.startsWith('wolf_tcg_log_') && file.endsWith('.txt')) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtimeMs < threeDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(chalk.gray(`🗑️ Deleted old log file: ${file}`));
        }
      }
    });
  } catch (err) {
    console.error(chalk.red(`⚠️ Error cleaning up old logs: ${err.message}`));
  }
}

cleanupOldLogs();

let currentLogDate = new Date().toISOString().slice(0, 10);
let logPath = path.join(logsDir, `wolf_tcg_log_${currentLogDate}.txt`);

if (!existsSync(logPath)) {
  const header = `──────────────────────────────
🐺 Wolf TCG Bot Log — ${currentLogDate}
──────────────────────────────\n`;
  fs.writeFileSync(logPath, header, "utf8");
}

function logEvent(message, color = "white", force = false) {
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
  console.log(colorMap[color] ? colorMap[color](message) : message);
  fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, "utf8");
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
let persistentState = { sentMessages: {}, streamStartTimes: {}, liveStatus: {}, userCache: {}, titleCache: {}, liveHistory: [] };
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

function saveState() {
  writeFileSync(stateFile, JSON.stringify(persistentState, null, 2), "utf8");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});

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
      { name: "Streamer", value: `[${userId}](https://www.tiktok.com/@${userId})`, inline: true },
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
  const lastUpdateUnix = Math.floor(Date.now() / 1000);
  const rememberedTitle = room?.title?.trim() || titleCache[userId];
  const streamTitle = rememberedTitle ? `🎬 **${rememberedTitle}**` : "🎬 **No title**";

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
    .setImage(user?.avatarUrl || room?.coverUrl || "https://i.imgur.com/AfFp7pu.png")
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

function connectEulerWSForUser(username) {
  resetRequestCounterIfNewDay();

  if (!canMakeRequest()) {
    logEvent(`🚫 Daily API request limit (${REQUEST_LIMIT}) reached. Skipping ${username}.`, "red");
    notifyOwner(`⚠️ Request limit (${REQUEST_LIMIT}) reached — skipping connection for ${username}.`, "warn");
    return;
  }

  recordRequest();
  if (requestState.count > REQUEST_LIMIT) return;

  const ws = new WebSocket(`wss://ws.eulerstream.com?uniqueId=${username}&apiKey=${apiKey}`);
  userConnections[username] = ws;

  const reconnectDelay = 90 * 1000;

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

      const userId = user.uniqueId;
      const now = Date.now();
      const wasLive = !!liveStatus[userId];

      if (room.isLive || !wasLive) {
        const previousAttempts = failedReconnects[username] || 0;
        if (previousAttempts > 0) {
          logEvent(`✅ [${username}] Connection restored — reset counter (was ${previousAttempts}/${MAX_RECONNECT_ATTEMPTS})`, "green");
        }
        failedReconnects[username] = 0;
      }

      if (room.isLive && !wasLive) {
        const streamStart = (room.startTime ?? Math.floor(now / 1000)) * 1000;
        const detectedMs = now - streamStart;

        if (detectedMs <= 30 * 1000) {
          logEvent(`⚡ [${username}] Detected live within 30 seconds`, "green");
        } else {
          logEvent(`🔴 [${username}] Detected live after ${Math.round(detectedMs / 1000)} seconds`, "green");
        }

        liveStatus[userId] = true;
        streamStartTimes[userId] = streamStart;
        userCache[userId] = { uniqueId: user.uniqueId, avatarUrl: user.avatarUrl };
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
          if (oldMsg) {
            await oldMsg.edit({
              content: `**${userId}'s stream has ended.**`,
              embeds: [embed],
              components: [liveActionRow(userId, false)],
            });
          } else {
            const newMsg = await channel.send({
              content: `**${userId}'s stream has ended.**`,
              embeds: [embed],
              components: [liveActionRow(userId, false)],
            });
            sentMessages[userId] = newMsg.id;
          }
          const historyEntry = liveHistory.find(h => h.userId === userId && h.endTime === null);
          if (historyEntry) historyEntry.endTime = Date.now();
          liveStatus[userId] = false;
          delete titleCache[userId];
          saveState();
          logEvent(`🟢 [${userId}] Offline embed sent (stream ended normally).`, "green");
        } catch (err) {
          logEvent(`❌ Error editing offline embed for ${userId}: ${err.message}`, "red");
        }
      }
    }
  });

  ws.on("close", async (code, reason) => {
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
        `🔴 [${username}] WS closed (code ${code}) | Live check (${currentAttempts} offline attempts stored) | API: ${requestState.count}/${REQUEST_LIMIT} | Reconnecting in 90s`,
        "gray"
      );
    }

    const attempt = failedReconnects[username] || 0;

    if (attempt >= MAX_RECONNECT_ATTEMPTS && wasLive) {
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
        if (oldMsg) {
          await oldMsg.edit({
            content: `**${username}'s stream has ended.**`,
            embeds: [embed],
            components: [liveActionRow(username, false)],
          });
        } else {
          await channel.send({
            content: `**${username}'s stream has ended.**`,
            embeds: [embed],
            components: [liveActionRow(username, false)],
          });
        }

        liveStatus[username] = false;
        delete titleCache[username];
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

client.once("ready", async () => {
  logEvent(`✅ Logged in as ${client.user.tag}`, "blue");
  await notifyOwner(`Bot restarted and logged in as **${client.user.tag}** 🚀`, "success");
  tikTokUsers.forEach((u) => {
    liveStatus[u] = false;
    connectEulerWSForUser(u);
  });
});

client.login(process.env.DISCORD_TOKEN);