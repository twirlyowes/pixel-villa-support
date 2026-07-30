// Location: activetime.js
const { EmbedBuilder } = require("discord.js");

const STAFF_ROLE_ID = "1511051007772069929"; 
const LOG_CHANNEL_ID = "1523648445276098680"; 
const ATLOGS_ROLE_ID = "1519005080471343216";

// --- JSONBIN CONFIGURATION ---
const BIN_ID = "6a61ab71da38895dfe82b0cc";
const API_KEY = "$2a$10$aCLBlkuqB51DVhDxNoqisureJOzr5ljUp6AyTncij4YryQSiAKPwa";
// -----------------------------

const activeSessions = new Map();
const voiceSessions = new Map();
let dailyActiveTimes = new Map();
let dailyVoiceTimes = new Map();
let dailyMessageCounts = new Map();
let dailyCommandCounts = new Map();

// --- JSONBIN SAVE LOCK / QUEUE SYSTEM ---
let isSaving = false;
let savePending = false;

async function loadSavedTimes() {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY }
    });
    const data = await response.json();
    const json = data.record || {};
    
    dailyActiveTimes = new Map(Object.entries(json.activeTimes || {}).map(([k, v]) => [k, Number(v)]));
    dailyVoiceTimes = new Map(Object.entries(json.voiceTimes || {}).map(([k, v]) => [k, Number(v)]));
    dailyMessageCounts = new Map(Object.entries(json.messageCounts || {}).map(([k, v]) => [k, Number(v)]));
    dailyCommandCounts = new Map(Object.entries(json.commandCounts || {}).map(([k, v]) => [k, Number(v)]));
  } catch (error) {
    console.error("Error reading from JSONBin:", error);
  }
}

async function executeSaveWithRetry() {
  const delays = [10000, 30000, 60000];
  const payload = {
    activeTimes: Object.fromEntries(dailyActiveTimes),
    voiceTimes: Object.fromEntries(dailyVoiceTimes),
    messageCounts: Object.fromEntries(dailyMessageCounts),
    commandCounts: Object.fromEntries(dailyCommandCounts)
  };

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return true;
      } else {
        console.warn(`JSONBin save failed with HTTP status ${response.status} (Attempt ${attempt + 1})`);
      }
    } catch (error) {
      console.warn(`JSONBin save threw an exception (Attempt ${attempt + 1}):`, error);
    }

    if (attempt < delays.length) {
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }

  console.error("Permanent failure saving to JSONBin after all retries have been exhausted.");
  return false;
}

async function saveTimesToFileWithQueue() {
  if (isSaving) {
    savePending = true;
    return;
  }

  isSaving = true;
  try {
    await executeSaveWithRetry();
  } finally {
    isSaving = false;
    if (savePending) {
      savePending = false;
      await saveTimesToFileWithQueue();
    }
  }
}

module.exports = (client) => {
  const isStaff = (member) => {
    return member && member.roles && member.roles.cache.has(STAFF_ROLE_ID);
  };

  client.once("ready", async () => {
    console.log("[DEBUG] Client ready event triggered. Loading saved times...");
    await loadSavedTimes();
    const now = Date.now();
    
    for (const guild of client.guilds.cache.values()) {
      guild.members.cache.forEach(member => {
        if (!member.user.bot && isStaff(member)) {
          const status = member.presence ? member.presence.status : "offline";
          if (status !== "offline") {
            activeSessions.set(member.id, now);
          }
          if (member.voice && member.voice.channel) {
            voiceSessions.set(member.id, now);
          }
        }
      });
    }

    startClockChecker(client);

    setInterval(async () => {
      const currentTimestamp = Date.now();
      for (const [userId, startTime] of activeSessions.entries()) {
        const duration = currentTimestamp - startTime;
        dailyActiveTimes.set(userId, (dailyActiveTimes.get(userId) || 0) + duration);
        activeSessions.set(userId, currentTimestamp);
      }
      for (const [userId, startTime] of voiceSessions.entries()) {
        const duration = currentTimestamp - startTime;
        dailyVoiceTimes.set(userId, (dailyVoiceTimes.get(userId) || 0) + duration);
        voiceSessions.set(userId, currentTimestamp);
      }
      await saveTimesToFileWithQueue();
    }, 5 * 60 * 1000);
  });

  function startClockChecker(clientInstance) {
    let lastLoggedDate = "";

    setInterval(async () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const currentDateString = now.toISOString().split("T")[0];

      if (hours === 21 && minutes === 30 && lastLoggedDate !== currentDateString) {
        lastLoggedDate = currentDateString;
        
        const guild = clientInstance.guilds.cache.first();
        if (guild) {
          await sendDailyReport(guild);
          
          setTimeout(async () => {
            dailyActiveTimes.clear();
            dailyVoiceTimes.clear();
            dailyMessageCounts.clear();
            dailyCommandCounts.clear();
            await saveTimesToFileWithQueue();
            console.log("Daily tracking data has been safely cleared and saved to JSONBin.");
          }, 5 * 60 * 1000);
        }
      }
    }, 60 * 1000);
  }

  async function sendDailyReport(guild) {
    try {
      const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!channel) return;

      const now = Date.now();
      for (const [userId, startTime] of activeSessions.entries()) {
        dailyActiveTimes.set(userId, (dailyActiveTimes.get(userId) || 0) + (now - startTime));
        activeSessions.set(userId, now);
      }
      for (const [userId, startTime] of voiceSessions.entries()) {
        dailyVoiceTimes.set(userId, (dailyVoiceTimes.get(userId) || 0) + (now - startTime));
        voiceSessions.set(userId, now);
      }

      const allStaffIds = new Set([
        ...dailyActiveTimes.keys(),
        ...dailyVoiceTimes.keys(),
        ...dailyMessageCounts.keys(),
        ...dailyCommandCounts.keys()
      ]);

      const sortedStaff = Array.from(allStaffIds).sort((a, b) => {
        return (dailyActiveTimes.get(b) || 0) - (dailyActiveTimes.get(a) || 0);
      });

      let reportLines = [];
      if (sortedStaff.length === 0) {
        reportLines.push("No active staff activity recorded today.");
      } else {
        for (const userId of sortedStaff) {
          const activeTime = dailyActiveTimes.get(userId) || 0;
          const voiceTime = dailyVoiceTimes.get(userId) || 0;
          const messages = dailyMessageCounts.get(userId) || 0;
          const commands = dailyCommandCounts.get(userId) || 0;

          const actSec = Math.floor(activeTime / 1000);
          const actH = Math.floor(actSec / 3600);
          const actM = Math.floor((actSec % 3600) / 60);
          const actS = actSec % 60;

          const voiceSec = Math.floor(voiceTime / 1000);
          const voiceH = Math.floor(voiceSec / 3600);
          const voiceM = Math.floor((voiceSec % 3600) / 60);
          const voiceS = voiceSec % 60;

          reportLines.push(`<@${userId}> | Online: **${actH}h ${actM}m ${actS}s** | Voice: **${voiceH}h ${voiceM}m ${voiceS}s** | Messages: **${messages}** | Commands: **${commands}**`);
        }
      }

      const embeds = [];
      let currentFieldValue = "";
      let isFirstEmbed = true;

      for (const line of reportLines) {
        if ((currentFieldValue + line + "\n").length > 1024) {
          const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle(isFirstEmbed ? "Daily Staff Activity Report (3:00 AM IST)" : "Daily Staff Activity Report (continued)")
            .setDescription(currentFieldValue)
            .setTimestamp();
          embeds.push(embed);
          isFirstEmbed = false;
          currentFieldValue = "";
        }
        currentFieldValue += line + "\n";
      }

      const finalEmbed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(isFirstEmbed ? "Daily Staff Activity Report (3:00 AM IST)" : "Daily Staff Activity Report (continued)")
        .setDescription(currentFieldValue)
        .setTimestamp();
      embeds.push(finalEmbed);

      for (const emb of embeds) {
        await channel.send({ embeds: [emb] });
      }

      await saveTimesToFileWithQueue();
    } catch (err) {
      console.error("Error sending daily report:", err);
    }
  }

  client.on("presenceUpdate", async (oldPresence, newPresence) => {
    const member = newPresence.member;
    if (!member || member.user.bot || !isStaff(member)) return;

    const userId = member.id;
    const oldStatus = oldPresence ? oldPresence.status : "offline";
    const newStatus = newPresence ? newPresence.status : "offline";

    const isNowActive = newStatus !== "offline";
    const wasActive = oldStatus !== "offline";

    if (isNowActive && !wasActive) {
      if (!activeSessions.has(userId)) {
        activeSessions.set(userId, Date.now());
      }
    } else if (!isNowActive && wasActive) {
      if (activeSessions.has(userId)) {
        const duration = Date.now() - activeSessions.get(userId);
        dailyActiveTimes.set(userId, (dailyActiveTimes.get(userId) || 0) + duration);
        activeSessions.delete(userId);
        saveTimesToFileWithQueue();
      }
    }
  });

  client.on("voiceStateUpdate", (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot || !isStaff(member)) return;

    const userId = member.id;
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    if (!oldChannel && newChannel) {
      if (!voiceSessions.has(userId)) {
        voiceSessions.set(userId, Date.now());
      }
    } else if (oldChannel && !newChannel) {
      if (voiceSessions.has(userId)) {
        const duration = Date.now() - voiceSessions.get(userId);
        dailyVoiceTimes.set(userId, (dailyVoiceTimes.get(userId) || 0) + duration);
        voiceSessions.delete(userId);
        saveTimesToFileWithQueue();
      }
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const member = message.member;
    if (member && isStaff(member)) {
      const userId = member.id;
      dailyMessageCounts.set(userId, (dailyMessageCounts.get(userId) || 0) + 1);
    }

    const rawContent = message.content.trim();
    const words = rawContent.split(/ +/);
    const commandName = words.shift().toLowerCase();

    const modCommands = [".warn", ".mute", ".unmute", ".kick", ".ban", ".unban", ".nick", ".wlist", ".wremove", ".wreset"];
    if (modCommands.includes(commandName) && member && isStaff(member)) {
      const userId = member.id;
      dailyCommandCounts.set(userId, (dailyCommandCounts.get(userId) || 0) + 1);
    }

    if (commandName === "atlogs") {
      const hasAdmin = message.member.permissions.has("Administrator");
      const hasRole = message.member.roles.cache.has(ATLOGS_ROLE_ID);

      if (!hasAdmin && !hasRole) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You do not have permission to use this command.")] });
      }
      await message.reply("🔄 Generating and sending the staff activity report now...");
      await sendDailyReport(message.guild);
      return;
    }

    if (commandName === "activetime") {
      let targetMember = message.mentions.members.first();

      if (!targetMember && words.length > 0) {
        const query = words.join(" ").toLowerCase();
        targetMember = message.guild.members.cache.find(m => 
          m.user.username.toLowerCase().includes(query) || 
          (m.nickname && m.nickname.toLowerCase().includes(query))
        );
      }

      if (!targetMember) {
        targetMember = message.member;
      }

      if (!isStaff(targetMember)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("That user is not a staff member or does not have the specified staff role.")] });
      }

      const userId = targetMember.id;
      const now = Date.now();

      let totalActive = dailyActiveTimes.get(userId) || 0;
      if (activeSessions.has(userId)) {
        totalActive += (now - activeSessions.get(userId));
      } else if (targetMember.presence && targetMember.presence.status !== "offline") {
        activeSessions.set(userId, now);
      }

      let totalVoice = dailyVoiceTimes.get(userId) || 0;
      if (voiceSessions.has(userId)) {
        totalVoice += (now - voiceSessions.get(userId));
      } else if (targetMember.voice && targetMember.voice.channel) {
        voiceSessions.set(userId, now);
      }

      const messages = dailyMessageCounts.get(userId) || 0;
      const commands = dailyCommandCounts.get(userId) || 0;

      const actSec = Math.floor(totalActive / 1000);
      const actH = Math.floor(actSec / 3600);
      const actM = Math.floor((actSec % 3600) / 60);
      const actS = actSec % 60;

      const voiceSec = Math.floor(totalVoice / 1000);
      const voiceH = Math.floor(voiceSec / 3600);
      const voiceM = Math.floor((voiceSec % 3600) / 60);
      const voiceS = voiceSec % 60;

      let currentSessionStr = "Not Active";
      if (activeSessions.has(userId)) {
        const sessionSec = Math.floor((now - activeSessions.get(userId)) / 1000);
        const sH = Math.floor(sessionSec / 3600);
        const sM = Math.floor((sessionSec % 3600) / 60);
        const sS = sessionSec % 60;
        currentSessionStr = `${sH}h ${sM}m ${sS}s`;
      }

      const status = targetMember.presence ? targetMember.presence.status : "offline";
      let statusFormatted = "🔴 Offline";
      if (status === "online") statusFormatted = "🟢 Online";
      else if (status === "idle") statusFormatted = "🟡 Idle";
      else if (status === "dnd") statusFormatted = "🔴 Do Not Disturb";

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("Staff Active Time Tracker (Today)")
        .setDescription(
          `👤 Staff Name: **${targetMember.user.username}**\n` +
          `🟢 Online Time: **${actH}h ${actM}m ${actS}s**\n` +
          `🎤 Voice Time: **${voiceH}h ${voiceM}m ${voiceS}s**\n` +
          `⌨️ Commands: **${commands}**\n` +
          `💬 Messages: **${messages}**\n` +
          `🟢 Status: **${statusFormatted}**\n` +
          `⏳ Current Session: **${currentSessionStr}**`
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  });
};
