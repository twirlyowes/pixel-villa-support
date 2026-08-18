const { EmbedBuilder } = require("discord.js");
const db = require("./firebase");

const STAFF_ROLE_ID = "1511051007772069929"; 
const LOG_CHANNEL_ID = "1523648445276098680"; 
const ATLOGS_ROLE_ID = "1519005080471343216";

const activeSessions = new Map();
const voiceSessions = new Map();
let dailyActiveTimes = new Map();
let dailyVoiceTimes = new Map();
let dailyMessageCounts = new Map();
let dailyCommandCounts = new Map();

let isSaving = false;
let savePending = false;

// Persisted "did we already reset today" marker (IST date string).
// Loaded from Firebase on startup so restarts/outages don't lose track of it.
let lastResetDate = null;

function formatHM(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

async function loadSavedTimes() {
  try {
    const snapshot = await db.collection("activetime").get();

    snapshot.forEach(doc => {
      const data = doc.data();
      dailyActiveTimes.set(doc.id, data.activeTime || 0);
      dailyVoiceTimes.set(doc.id, data.voiceTime || 0);
      dailyMessageCounts.set(doc.id, data.messages || 0);
      dailyCommandCounts.set(doc.id, data.commands || 0);
    });

    console.log("✅ Active times loaded from Firebase");
  } catch (error) {
    console.error("❌ Firebase load error:", error);
  }
}

async function loadLastResetDate() {
  try {
    const doc = await db.collection("meta").doc("dailyReset").get();
    if (doc.exists) {
      lastResetDate = doc.data().lastResetDate || null;
    }
    console.log(`✅ Last reset date loaded: ${lastResetDate || "(none recorded yet)"}`);
  } catch (error) {
    console.error("❌ Firebase loadLastResetDate error:", error);
  }
}

async function saveLastResetDate(dateStr) {
  try {
    await db.collection("meta").doc("dailyReset").set({ lastResetDate: dateStr }, { merge: true });
    lastResetDate = dateStr;
  } catch (error) {
    console.error("❌ Firebase saveLastResetDate error:", error);
  }
}

async function executeSaveWithRetry() {
  try {
    const batch = db.batch();

    const users = new Set([
      ...dailyActiveTimes.keys(),
      ...dailyVoiceTimes.keys(),
      ...dailyMessageCounts.keys(),
      ...dailyCommandCounts.keys()
    ]);

    for (const userId of users) {
      const ref = db.collection("activetime").doc(userId);

      batch.set(ref, {
        activeTime: dailyActiveTimes.get(userId) || 0,
        voiceTime: dailyVoiceTimes.get(userId) || 0,
        messages: dailyMessageCounts.get(userId) || 0,
        commands: dailyCommandCounts.get(userId) || 0,
        updatedAt: new Date()
      }, { merge: true });
    }

    await batch.commit();
    return true;
  } catch (error) {
    console.error("❌ Firebase save error:", error);
    return false;
  }
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

async function resetFirebaseRecords(userIds) {
  if (!userIds || userIds.size === 0) return;

  try {
    const batch = db.batch();

    for (const userId of userIds) {
      const ref = db.collection("activetime").doc(userId);
      batch.set(ref, {
        activeTime: 0,
        voiceTime: 0,
        messages: 0,
        commands: 0,
        updatedAt: new Date()
      }, { merge: true });
    }

    await batch.commit();
    console.log(`✅ Reset Firebase activetime records for ${userIds.size} staff member(s).`);
  } catch (error) {
    console.error("❌ Firebase reset error:", error);
  }
}

module.exports = (client) => {
  const isStaff = (member) => {
    return member && member.roles && member.roles.cache.has(STAFF_ROLE_ID);
  };

  client.once("ready", async () => {
    console.log("[DEBUG] Client ready event triggered. Loading saved times...");
    await loadSavedTimes();
    await loadLastResetDate();
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
    }, 15 * 60 * 1000);
  });

  // Self-healing daily rollover.
  // Instead of relying purely on catching the exact 3:00-3:05 AM IST window with
  // an in-memory flag (which silently fails/drifts if the bot is down at that time,
  // e.g. a host/GitHub outage), this checks every minute whether today's IST date
  // has already been marked as reset in Firebase. If the bot comes back online
  // later in the day and the date doesn't match, it treats it as a missed reset
  // and catches up immediately instead of waiting for tomorrow's window.
  function startClockChecker(clientInstance) {
    setInterval(async () => {
      const nowOptions = { timeZone: "Asia/Kolkata", hour12: false };
      const istDateString = new Intl.DateTimeFormat("en-US", { ...nowOptions, dateStyle: "short" }).format(new Date());
      const istTimeStr = new Intl.DateTimeFormat("en-US", { ...nowOptions, hour: "numeric", minute: "numeric" }).format(new Date());
      const [istHours] = istTimeStr.split(":").map(Number);

      const alreadyResetToday = lastResetDate === istDateString;
      if (alreadyResetToday) return;

      const inNormalWindow = istHours === 3;
      const overdue = istHours > 3; // any time after 3AM IST that hasn't been reset yet = missed window

      if (!inNormalWindow && !overdue) return; // it's before 3AM IST, nothing to do yet

      const guild = clientInstance.guilds.cache.first();
      if (!guild) return;

      console.log(overdue
        ? `[Auto-Sender] Missed 3AM IST reset for ${istDateString} (bot likely restarted/was down) — running catch-up now...`
        : "[Auto-Sender] Triggering 3:00 AM IST Daily Report...");

      const reportSent = await sendDailyReport(guild);

      if (!reportSent) {
        console.error("⚠️ [Auto-Sender] Daily report FAILED to send — skipping the automatic reset so today's data isn't lost. Run atlogs manually once the issue is fixed; reset will be retried automatically once a report send succeeds.");
        return;
      }

      const allKnownUsers = new Set([
        ...dailyActiveTimes.keys(),
        ...dailyVoiceTimes.keys(),
        ...dailyMessageCounts.keys(),
        ...dailyCommandCounts.keys(),
        ...activeSessions.keys(),
        ...voiceSessions.keys()
      ]);

      dailyActiveTimes.clear();
      dailyVoiceTimes.clear();
      dailyMessageCounts.clear();
      dailyCommandCounts.clear();

      const freshNow = Date.now();
      for (const userId of activeSessions.keys()) {
        activeSessions.set(userId, freshNow);
      }
      for (const userId of voiceSessions.keys()) {
        voiceSessions.set(userId, freshNow);
      }

      await resetFirebaseRecords(allKnownUsers);
      await saveLastResetDate(istDateString);
      console.log(`✅ Daily tracking data has been safely cleared, reset, and saved for ${istDateString} IST.`);
    }, 60 * 1000);
  }

  async function sendDailyReport(guild) {
    try {
      const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch((fetchErr) => {
        console.error(`❌ [DailyReport] channels.fetch(${LOG_CHANNEL_ID}) threw:`, fetchErr && fetchErr.message ? fetchErr.message : fetchErr);
        return null;
      });
      if (!channel) {
        console.error(`❌ [DailyReport] Could not resolve log channel ${LOG_CHANNEL_ID}. Either the ID is wrong, the channel was deleted, or the bot can't see it (missing View Channel permission).`);
        return false;
      }

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

          reportLines.push(`<@${userId}> • 🟢 **${formatHM(activeTime)}** • 🎙️ **${formatHM(voiceTime)}** • 💬 **${messages}** • ⚙️ **${commands}**`);
        }
      }

      const embeds = [];
      let currentFieldValue = "";
      let isFirstEmbed = true;

      for (const line of reportLines) {
        if ((currentFieldValue + line + "\n").length > 1024) {
          const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle(isFirstEmbed ? "Daily Staff Activity Report" : "Daily Staff Activity Report (continued)")
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
        .setTitle(isFirstEmbed ? "Daily Staff Activity Report" : "Daily Staff Activity Report (continued)")
        .setDescription(currentFieldValue)
        .setTimestamp();
      embeds.push(finalEmbed);

      for (const emb of embeds) {
        await channel.send({ embeds: [emb] });
      }

      console.log(`✅ [DailyReport] Sent successfully to #${channel.name || channel.id} (${embeds.length} embed(s), ${sortedStaff.length} staff member(s)).`);

      await saveTimesToFileWithQueue();
      return true;
    } catch (err) {
      console.error("❌ [DailyReport] Error sending daily report:", err && err.stack ? err.stack : err);
      return false;
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

    if (commandName === "resetactivetime") {
      const hasAdmin = message.member.permissions.has("Administrator");
      const hasRole = message.member.roles.cache.has(ATLOGS_ROLE_ID);

      if (!hasAdmin && !hasRole) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You do not have permission to use this command.")] });
      }

      await message.reply("🔄 Force-resetting activity tracking now (sending a snapshot report first)...");

      // Send a snapshot report of current (possibly merged) data before wiping it,
      // so there's at least a record of what got cleared.
      await sendDailyReport(message.guild);

      const allKnownUsers = new Set([
        ...dailyActiveTimes.keys(),
        ...dailyVoiceTimes.keys(),
        ...dailyMessageCounts.keys(),
        ...dailyCommandCounts.keys(),
        ...activeSessions.keys(),
        ...voiceSessions.keys()
      ]);

      dailyActiveTimes.clear();
      dailyVoiceTimes.clear();
      dailyMessageCounts.clear();
      dailyCommandCounts.clear();

      const freshNow = Date.now();
      for (const userId of activeSessions.keys()) {
        activeSessions.set(userId, freshNow);
      }
      for (const userId of voiceSessions.keys()) {
        voiceSessions.set(userId, freshNow);
      }

      await resetFirebaseRecords(allKnownUsers);

      const nowOptions = { timeZone: "Asia/Kolkata", hour12: false };
      const istDateString = new Intl.DateTimeFormat("en-US", { ...nowOptions, dateStyle: "short" }).format(new Date());
      await saveLastResetDate(istDateString);

      console.log(`✅ [ManualReset] Activity data force-reset by ${message.author.tag} at ${new Date().toISOString()} (marked as reset for ${istDateString} IST).`);
      await message.channel.send("✅ Activity tracking has been reset. Fresh tracking starts now.");
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

      const status = targetMember.presence ? targetMember.presence.status : "offline";

      let statusFormatted = "<a:error:1532986765105696778> Offline";
      if (status === "online") statusFormatted = "<a:ONLINE:1532986890519711815> Online";
      else if (status === "idle") statusFormatted = "<a:Moon:1532988257338527835> Idle";
      else if (status === "dnd") statusFormatted = "<a:error:1532986765105696778> Do Not Disturb";

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setAuthor({
            name: "Pixel Villa Support • Activity Tracker",
            iconURL: client.user.displayAvatarURL()
        })
        .setThumbnail(targetMember.user.displayAvatarURL({ dynamic: true }))
        .setDescription(
`<:Shield_2:1532989398642327594> **${targetMember}**

<a:Clock:1532990759371018372> Online: **${formatHM(totalActive)}**
<a:voice:1532987137199440003> Voice: **${formatHM(totalVoice)}**
<:Stats:1532990723408793661> Commands: **${commands}**
<a:LP_Message:1532991009066324049> Messages: **${messages}**
${statusFormatted}`
        )
        .setFooter({
            text: "Pixel Villa Support • Activity Module"
        })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  });
};


let shuttingDown = false;

async function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`🛑 Received ${signal}. Saving active times before shutdown...`);

  try {
    const now = Date.now();

    for (const [userId, startTime] of activeSessions.entries()) {
      const duration = now - startTime;
      dailyActiveTimes.set(userId, (dailyActiveTimes.get(userId) || 0) + duration);
      activeSessions.set(userId, now);
    }

    for (const [userId, startTime] of voiceSessions.entries()) {
      const duration = now - startTime;
      dailyVoiceTimes.set(userId, (dailyVoiceTimes.get(userId) || 0) + duration);
      voiceSessions.set(userId, now);
    }

    await saveTimesToFileWithQueue();
    console.log("✅ Active times saved successfully.");
  } catch (err) {
    console.error("❌ Failed to save active times during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
