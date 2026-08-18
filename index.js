// Location: index.js
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  ActivityType,
  Partials
} = require("discord.js");
const fs = require("fs").promises; // Non-blocking async fs
const path = require("path");
const config = require("./config.json");
const hubCommand = require("./minigames/hub.js"); // Integrated our minigames entry module

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,

    // REQUIRED FOR MODMAIL DMs
    GatewayIntentBits.DirectMessages
  ],

  // REQUIRED FOR DM CHANNELS
  partials: [
    Partials.Channel
  ]
});

// Fix: Increase max listeners to prevent the memory leak warning since multiple modules attach messageCreate/presence listeners
client.setMaxListeners(20);

const PREFIX = ".";
const WARN_FILE = path.join(__dirname, "warnings.json");

// ===== AUTO SLOWMODE CONFIG =====
const AUTO_SLOWMODE_CHANNEL_ID = "1519052869574201506";
const AUTO_SLOWMODE_WINDOW_MS = 30 * 1000; // 30 second rolling window
const AUTO_SLOWMODE_USER_THRESHOLD = 5;   // unique chatters needed to trigger
const AUTO_SLOWMODE_SECONDS = 3;           // slowmode duration when triggered

// Map<channelId, Array<{ userId, timestamp }>>
const recentChatters = new Map();
// Map<channelId, boolean> - tracks whether we currently believe slowmode is ON (avoids redundant API calls)
const slowmodeState = new Map();

async function handleAutoSlowmode(message) {
  if (message.channel.id !== AUTO_SLOWMODE_CHANNEL_ID) return;

  const now = Date.now();
  let entries = recentChatters.get(message.channel.id) || [];

  // Add this message's author + timestamp
  entries.push({ userId: message.author.id, timestamp: now });

  // Drop anything outside the rolling window
  entries = entries.filter(e => now - e.timestamp <= AUTO_SLOWMODE_WINDOW_MS);
  recentChatters.set(message.channel.id, entries);

  // Count unique chatters in the window
  const uniqueUsers = new Set(entries.map(e => e.userId)).size;
  const isSlowmodeOn = slowmodeState.get(message.channel.id) || false;

  try {
    if (uniqueUsers >= AUTO_SLOWMODE_USER_THRESHOLD && !isSlowmodeOn) {
      await message.channel.setRateLimitPerUser(
        AUTO_SLOWMODE_SECONDS,
        `Auto-slowmode: ${uniqueUsers} unique chatters in the last ${AUTO_SLOWMODE_WINDOW_MS / 1000}s`
      );
      slowmodeState.set(message.channel.id, true);
    } else if (uniqueUsers < AUTO_SLOWMODE_USER_THRESHOLD && isSlowmodeOn) {
      await message.channel.setRateLimitPerUser(
        0,
        `Auto-slowmode: activity dropped to ${uniqueUsers} unique chatters in the last ${AUTO_SLOWMODE_WINDOW_MS / 1000}s`
      );
      slowmodeState.set(message.channel.id, false);
    }
  } catch (err) {
    console.error("Auto-slowmode error:", err);
  }
}

// Safe async initialization
(async () => {
  try {
    await fs.access(WARN_FILE);
  } catch {
    await fs.writeFile(WARN_FILE, "{}", "utf8");
  }
})();

async function getWarnings() {
  try {
    const data = await fs.readFile(WARN_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading warnings:", error);
    return {};
  }
}

async function saveWarnings(data) {
  try {
    await fs.writeFile(WARN_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving warnings:", error);
  }
}

function makeEmbed(color, text) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(text)
    .setTimestamp();
}

function hasModPermission(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
}

function hierarchyCheck(message, target) {
  if (target.id === message.author.id) return false;
  if (!message.member.roles.highest || !target.roles.highest) return true;
  return target.roles.highest.position < message.member.roles.highest.position;
}

function ms(time) {
  if (!time) return null;
  const number = parseInt(time, 10);
  if (isNaN(number)) return null;

  if (time.endsWith("s")) return number * 1000;
  if (time.endsWith("m")) return number * 60000;
  if (time.endsWith("h")) return number * 3600000;
  if (time.endsWith("d")) return number * 86400000;
  return null;
}

async function sendLog(guild, embed) {
  if (!config.LOG_CHANNEL_ID) return;
  try {
    const channel = guild.channels.cache.get(config.LOG_CHANNEL_ID) ||
                    await guild.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);

    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Failed to send log:", err);
  }
}

client.once("ready", () => {
  console.log(`${client.user.tag} is online and fully optimized!`);

  client.user.setPresence({
  activities: [
    {
      name: "Pixel Villa Support",
      type: ActivityType.Streaming,
      url: "https://www.twitch.tv/discord",
    },
  ],
  status: "dnd",
});
});
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  // Auto-slowmode watcher runs on every human message, independent of command routing
  await handleAutoSlowmode(message);

  const rawContent = message.content.trim();
  const words = rawContent.split(/ +/);
  const firstWord = words[0].toLowerCase();

  let command = "";
  let args = [];

  // Route prefix-less commands vs prefixed commands
  if (firstWord === "purge" || firstWord === "vcp") {
    command = firstWord;
    args = words.slice(1);
  } else if (rawContent.startsWith(PREFIX)) {
    args = rawContent.slice(PREFIX.length).trim().split(/ +/);
    command = args.shift().toLowerCase();
  } else {
    return;
  }

  try {
    // 0. MINIGAMES HUB COMMAND (Requires Prefix: .minigames)
    if (command === "minigames") {
      await hubCommand.execute(message, args);
      return; 
    }

    // 0.5 EMERGENCY FORCE STOP COMMAND (Requires Prefix: .stopgame)
    if (command === "stopgame") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply({ 
          embeds: [makeEmbed("Red", "❌ You need **Manage Messages** permissions to force-stop a game.")] 
        });
      }
      
      const gameManager = require("./minigames/utils/GameManager");
      if (gameManager.isGameRunning(message.channel.id)) {
        gameManager.deleteGame(message.channel.id);
        return message.reply({ 
          embeds: [makeEmbed("Green", "🛑 The active game lobby has been forcefully closed and the channel is now unlocked.")] 
        });
      } else {
        return message.reply({ 
          embeds: [makeEmbed("Red", "ℹ️ There are no active minigames running in this channel right now.")] 
        });
      }
    }

    // 1. MUTE COMMAND (Requires Prefix)
    if (command === "mute") {
      const user = message.mentions.members.first();
      const time = args[1]; // args[0] is the mention, args[1] is the time duration
      const reason = args.slice(2).join(" ") || "No reason provided";

      if (!user || !time || !ms(time)) {
        return message.reply({
          embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}mute @user [time: 10m/1h] [reason]`)]
        });
      }

      if (!hasModPermission(message.member)) {
        return message.reply({
          embeds: [makeEmbed("Red", "You need the **Moderate Members** permission.")]
        });
      }

      if (!hierarchyCheck(message, user)) {
        return message.reply({
          embeds: [makeEmbed("Red", "You cannot mute this user due to role hierarchy.")]
        });
      }

      await user.timeout(ms(time), reason);

      const embed = makeEmbed(
        "Red",
        `**${user.user.tag}** has been muted.\n\n**Duration:** ${time}\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`
      );

      await message.reply({ embeds: [embed] });
      await sendLog(message.guild, embed);
    }

    // 2. UNMUTE COMMAND (Requires Prefix)
    if (command === "unmute") {
      const user = message.mentions.members.first();

      if (!user) {
        return message.reply({
          embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}unmute @user`)]
        });
      }

      if (!hasModPermission(message.member)) {
        return message.reply({
          embeds: [makeEmbed("Red", "You need the **Moderate Members** permission.")]
        });
      }

      if (!user.isCommunicationDisabled()) {
        return message.reply({
          embeds: [makeEmbed("Red", "That user is not currently muted.")]
        });
      }

      await user.timeout(null);

      const embed = makeEmbed(
        "Green",
        `**${user.user.tag}** has been unmuted.\n\n**Moderator:** ${message.author.tag}`
      );

      await message.reply({ embeds: [embed] });
      await sendLog(message.guild, embed);
    }

    // 3. PURGE COMMAND (No Prefix)
    if (command === "purge") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply({
          embeds: [makeEmbed("Red", "You need the **Manage Messages** permission.")]
        });
      }

      const amount = Number(args[0]);
      if (!amount || amount < 1 || amount > 100) {
        return message.reply({
          embeds: [makeEmbed("Red", "Please enter a valid amount between 1 and 100. (e.g., `purge 50`)")]
        });
      }

      await message.delete().catch(() => {});
      await message.channel.bulkDelete(amount, true);

      const embed = makeEmbed(
        "Green",
        `Successfully deleted **${amount}** messages.\n\n**Moderator:** ${message.author.tag}`
      );

      const successMsg = await message.channel.send({ embeds: [embed] });
      setTimeout(() => successMsg.delete().catch(() => {}), 4000);
    }

    // 4. VOICE CHANNEL PULL (VCP) COMMAND (No Prefix)
if (command === "vcp") {
  const search = args.join(" ").trim().toLowerCase();

  const user =
    message.mentions.members.first() ||
    message.guild.members.cache.get(search) ||
    message.guild.members.cache.find(member =>
      member.user.username.toLowerCase().includes(search)
    ) ||
    message.guild.members.cache.find(member =>
      member.displayName.toLowerCase().includes(search)
    );

  if (!user) {
    return message.reply({
      embeds: [makeEmbed("Red", "Please mention a valid user or provide part of their username/display name. (e.g., `vcp @user`, `vcp Celestial`, or `vcp cele`)")]
    });
  }

  if (!message.member.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
    return message.reply({
      embeds: [makeEmbed("Red", "You need the **Move Members** permission.")]
    });
  }

  const voiceChannel = message.member.voice.channel;

  if (!voiceChannel) {
    return message.reply({
      embeds: [makeEmbed("Red", "You must be sitting inside a voice channel to pull someone.")]
    });
  }

  if (!user.voice.channel) {
    return message.reply({
      embeds: [makeEmbed("Red", "That user isn't connected to any voice channel right now.")]
    });
  }

  // Reason is passed through so Discord's built-in Audit Log shows why the move happened
  await user.voice.setChannel(
    voiceChannel,
    `Voice-pulled by ${message.author.tag}`
  );

  const embed = makeEmbed(
    "Green",
    `Pulled **${user.user.tag}** into your voice channel.\n\n**Moderator:** ${message.author.tag}`
  );

  await message.reply({ embeds: [embed] });
  // NOTE: bot log-channel post removed for vcp per request — Discord's own Audit Log still records this move.
}
      } catch (error) {
    console.error(`Command Error Encountered (${command}):`, error);
    message.reply({
      embeds: [makeEmbed("Red", "Something went sideways while running that command.")]
    }).catch(() => {});
  }
});

require("./firebase");    
console.log("Loading help...");
require("./help")(client);

console.log("Loading badwords...");
require("./badwords")(client);

console.log("Loading mod...");
require("./mod")(client);

console.log("Loading verify...");
require("./verify")(client);

console.log("Loading misc...");
require("./misc")(client);

console.log("Loading voicesystem...");
require("./voicesystem")(client);

console.log("Loading warn...");
require("./warn")(client, {
  getWarnings,
  saveWarnings,
  hasModPermission,
  hierarchyCheck,
  sendLog
});

console.log("Loading activetime...");
require("./activetime")(client);

console.log("Loading afk...");
require("./afk")(client);

console.log("About to login...");
console.log("Token exists:", !!config.TOKEN);

client.login(config.TOKEN)
  .then(() => console.log("✅ Login successful"))
  .catch(err => console.error("❌ Login failed:", err));
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Keep-alive server is running on port ${PORT}`);
});
