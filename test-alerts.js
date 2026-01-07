import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import dotenv from "dotenv";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const alertChannelId = process.env.ALERT_CHANNEL_ID;
const ownerId = process.env.OWNER_ID;

if (!process.env.DISCORD_TOKEN || !alertChannelId || !ownerId) {
  console.error("❌ Missing required .env variables!");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
});

function buildTestLiveEmbed() {
  const now = Date.now();
  const startUnix = Math.floor(now / 1000);
  
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setAuthor({
      name: "test_user",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.tiktok.com/@test_user",
    })
    .setTitle("test_user's stream is LIVE!")
    .addFields(
      { name: "Status", value: "🔴 Live Now!", inline: true },
      { name: "Streamer", value: "[test_user](https://www.tiktok.com/@test_user)", inline: true },
      { name: "Title", value: "🎬 **Test Stream - Alert System Check**", inline: false },
      {
        name: "Stream Info",
        value: `🕒 **Started:** <t:${startUnix}:F>\n🔴 **Live Since:** <t:${startUnix}:R>\n🕓 **Last Updated:** <t:${startUnix}:R>`,
        inline: false,
      }
    )
    .setImage("https://i.imgur.com/AfFp7pu.png")
    .setFooter({ text: "Wolf TCG Alerts - TEST MODE" })
    .setTimestamp();
}

function buildTestOfflineEmbed() {
  const now = Date.now();
  const startMs = now - (45 * 60 * 1000);
  const startUnix = Math.floor(startMs / 1000);
  const endUnix = Math.floor(now / 1000);
  
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: "test_user",
      iconURL: "https://i.imgur.com/AfFp7pu.png",
      url: "https://www.tiktok.com/@test_user",
    })
    .setTitle("test_user's stream has ended.")
    .addFields(
      { name: "Status", value: "🟢 Stream Ended", inline: true },
      { name: "Title", value: "🎬 **Test Stream - Alert System Check**", inline: false },
      {
        name: "Stream Info",
        value:
          `🕒 **Started:** <t:${startUnix}:f>\n` +
          `✅ **Ended:** <t:${endUnix}:f>\n` +
          `⏱️ **Duration:** 45m 0s\n`,
        inline: false,
      }
    )
    .setImage("https://i.imgur.com/AfFp7pu.png")
    .setFooter({ text: "Wolf TCG Alerts - TEST MODE" })
    .setTimestamp();
}

function buildOwnerEmbed(message, type = "info") {
  const colorMap = {
    info: 0x5865f2,
    success: 0x57f287,
    warn: 0xfee75c,
    error: 0xed4245,
    live: 0xff0000,
    offline: 0x57f287,
  };
  const color = colorMap[type] || 0x5865f2;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle("🐺 Wolf TCG Bot Notice")
    .setDescription(message)
    .setFooter({ text: `Sent ${new Date().toLocaleString("en-GB")} - TEST MODE` });
}

function liveActionRow(isLive) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(isLive ? "🔴 Watch Live" : "⚪ Offline")
      .setStyle(ButtonStyle.Link)
      .setURL("https://www.tiktok.com/@test_user")
  );
}

async function runTests() {
  console.log("\n🧪 Starting Alert System Tests...\n");
  
  try {
    const channel = await client.channels.fetch(alertChannelId);
    const owner = await client.users.fetch(ownerId);
    
    console.log("📤 Test 1/6: Sending LIVE alert to channel...");
    await channel.send({
      content: "@everyone **test_user is now LIVE!** *(TEST)*",
      embeds: [buildTestLiveEmbed()],
      components: [liveActionRow(true)],
    });
    console.log("✅ Live alert sent!\n");
    await sleep(2000);
    
    console.log("📤 Test 2/6: Sending OFFLINE alert to channel...");
    await channel.send({
      content: "**test_user's stream has ended.** *(TEST)*",
      embeds: [buildTestOfflineEmbed()],
      components: [liveActionRow(false)],
    });
    console.log("✅ Offline alert sent!\n");
    await sleep(2000);
    
    console.log("📤 Test 3/6: Sending bot started DM to owner...");
    await owner.send({ embeds: [buildOwnerEmbed("Bot restarted and logged in as **TEST BOT** 🚀 *(TEST)*", "success")] });
    console.log("✅ Bot started DM sent!\n");
    await sleep(2000);
    
    console.log("📤 Test 4/6: Sending stream live DM to owner...");
    await owner.send({ embeds: [buildOwnerEmbed("🔴 test_user is now LIVE! *(TEST)*", "live")] });
    console.log("✅ Stream live DM sent!\n");
    await sleep(2000);
    
    console.log("📤 Test 5/6: Sending API warning DM to owner...");
    await owner.send({ embeds: [buildOwnerEmbed("⚠️ You've reached **900/1000** API requests for today. *(TEST)*", "warn")] });
    console.log("✅ API warning DM sent!\n");
    await sleep(2000);
    
    console.log("📤 Test 6/6: Sending connection issue DM to owner...");
    await owner.send({ embeds: [buildOwnerEmbed("⚠️ test_user's stream marked offline after 4 failed reconnects. *(TEST)*", "warn")] });
    console.log("✅ Connection issue DM sent!\n");
    
    console.log("\n🎉 All tests completed successfully!");
    console.log("📱 Check your Discord channel and DMs for the test alerts.\n");
    
  } catch (err) {
    console.error("❌ Test failed:", err.message);
  }
  
  process.exit(0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await runTests();
});

client.login(process.env.DISCORD_TOKEN);
