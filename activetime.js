const { EmbedBuilder } = require("discord.js");
const db = require("./firebase");

const STAFF_ROLE_ID = "1511051007772069929";
const LOG_CHANNEL_ID = "1523648445276098680";
const ATLOGS_ROLE_ID = "1519005080471343216";
const PIXEL_VILLA_GUILD_ID = "1510176142286389329";

const activeSessions = new Map();
const voiceSessions = new Map();
let dailyActiveTimes = new Map();
let dailyVoiceTimes = new Map();
let dailyMessageCounts = new Map();
let dailyCommandCounts = new Map();

let isSaving = false;
let savePending = false;

// Persisted "did we already X today" markers (IST date strings).
// Report and reset are tracked separately so they can fire 5 minutes apart,
// matching the original 3:00 report / 3:05 reset schedule.
let lastResetDate = null;
let lastReportDate = null;

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
      lastReportDate = doc.data().lastReportDate || null;
    }
    console.log(`✅ Last reset date loaded: ${lastResetDate || "(none recorded yet)"} | Last report date: ${lastReportDate || "(none recorded yet)"}`);
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

async function saveLastReportDate(dateStr) {
  try {
    await db.collection("meta").doc("dailyReset").set({ lastReportDate: dateStr }, { merge: true });
    lastReportDate = dateStr;
  } catch (error) {
    console.error("❌ Firebase saveLastReportDate error:", error);
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

// SAFE daily rollover: resets everyone's stats to 0 for the new day.
// Does NOT delete anything and does NOT depend on any Discord API fetch —
// this is pure in-memory + Firebase writes, so it cannot fail due to rate
// limits, cannot be tricked by an empty fetch result, and can never wipe
// data based on a fetch failure. Deletion only ever happens via the
// explicit, admin-triggered .removeuser command below.
async function performDailyReset() {
  try {
    const allKnownIds = new Set([
      ...dailyActiveTimes.keys(),
      ...dailyVoiceTimes.keys(),
      ...dailyMessageCounts.keys(),
      ...dailyCommandCounts.keys(),
      ...activeSessions.keys(),
      ...voiceSessions.keys()
    ]);

    const batch = db.batch();
    for (const userId of allKnownIds) {
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

    const freshNow = Date.now();
    for (const userId of allKnownIds) {
      dailyActiveTimes.set(userId, 0);
      dailyVoiceTimes.set(userId, 0);
      dailyMessageCounts.set(userId, 0);
      dailyCommandCounts.set(userId, 0);
      if (activeSessions.has(userId)) activeSessions.set(userId, freshNow);
      if (voiceSessions.has(userId)) voiceSessions.set(userId, freshNow);
    }

    console.log(`✅ Daily reset complete: zeroed stats for ${allKnownIds.size} tracked member(s). Nothing was deleted.`);
  } catch (error) {
    console.error("❌ [DailyReset] Error:", error && error.stack ? error.stack : error);
  }
}

// Explicit, admin-only removal of a single member's activetime record.
// This is the ONLY place in the whole file that deletes Firebase data,
// and it only ever runs when an admin/atlogs-role staff member types
// the command with a specific user ID — never automatically.
async function removeUserRecord(userId) {
  try {
    await db.collection("activetime").doc(userId).delete();
  } catch (error) {
    console.error(`❌ [RemoveUser] Firebase delete error for ${userId}:`, error);
    throw error;
  }

  dailyActiveTimes.delete(userId);
  dailyVoiceTimes.delete(userId);
  dailyMessageCounts.delete(userId);
  dailyCommandCounts.delete(userId);
  activeSessions.delete(userId);
  voiceSessions.delete(userId);
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

  // Self-healing daily schedule — report fires at 3:00 AM IST, reset fires
  // separately at 3:05 AM IST, matching the original timing. Each has its
  // own persisted "already done today" marker so they can't double-fire and
  // don't depend on each other beyond report-must-happen-before-reset.
  // Pinned to Pixel Villa's guild ID directly (never .first()).
  function startClockChecker(clientInstance) {
    let cycleRunning = false; // prevents overlapping ticks from firing twice

    setInterval(async () => {
      if (cycleRunning) return;

      const nowOptions = { timeZone: "Asia/Kolkata", hour12: false };
      const istDateString = new Intl.DateTimeFormat("en-US", { ...nowOptions, dateStyle: "short" }).format(new Date());
      const istTimeStr = new Intl.DateTimeFormat("en-US", { ...nowOptions, hour: "numeric", minute: "numeric" }).format(new Date());
      const [istHours, istMinutes] = istTimeStr.split(":").map(Number);

      const pastReportTime = istHours > 3 || (istHours === 3 && istMinutes >= 0);
      const pastResetTime = istHours > 3 || (istHours === 3 && istMinutes >= 5);

      const reportDueOrOverdue = pastReportTime && lastReportDate !== istDateString;
      const resetDueOrOverdue = pastResetTime && lastReportDate === istDateString && lastResetDate !== istDateString;

      if (!reportDueOrOverdue && !resetDueOrOverdue) return;

      const guild = clientInstance.guilds.cache.get(PIXEL_VILLA_GUILD_ID);
      if (!guild) {
        console.error(`❌ [Auto-Sender] Could not find guild ${PIXEL_VILLA_GUILD_ID} in client.guilds.cache.`);
        return;
      }

      cycleRunning = true;
      try {
        if (reportDueOrOverdue) {
          const overdue = istHours > 3 || istMinutes > 0;
          console.log(overdue
            ? `[Auto-Sender] Missed 3:00 AM IST report for ${istDateString} (bot likely restarted/was down) — sending catch-up report now...`
            : "[Auto-Sender] Triggering 3:00 AM IST Daily Report...");

          const reportSent = await sendDailyReport(guild);
          if (reportSent) {
            await saveLastReportDate(istDateString);
          } else {
            console.error("⚠️ [Auto-Sender] Daily report FAILED to send — reset will be retried automatically once a report send succeeds. Run .atlogs manually if this keeps happening.");
          }
          return; // reset waits for its own tick at least 5 min later
        }

        if (resetDueOrOverdue) {
          console.log(`[Auto-Sender] Running 3:05 AM IST reset for ${istDateString}...`);
          await performDailyReset();
          await saveLastResetDate(istDateString);
          console.log(`✅ Daily tracking data has been safely reset and saved for ${istDateString} IST.`);
        }
      } finally {
        cycleRunning = false;
      }
    }, 60 * 1000);
  }

  async function sendDailyReport(guild) {
    try {
      const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch((fetchErr) => {
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

      const allKnownIds = new Set([
        ...dailyActiveTimes.keys(),
        ...dailyVoiceTimes.keys(),
        ...dailyMessageCounts.keys(),
        ...dailyCommandCounts.keys()
      ]);

      // Only non-zero entries shown. No live Discord API role-check here —
      // that's what caused the rate-limit/data-loss issue. Use .removeuser
      // to clean out banned members' records explicitly instead.
      const eligible = Array.from(allKnownIds).filter(userId => {
        const activeTime = dailyActiveTimes.get(userId) || 0;
        const voiceTime = dailyVoiceTimes.get(userId) || 0;
        const messages = dailyMessageCounts.get(userId) || 0;
        const commands = dailyCommandCounts.get(userId) || 0;
        return activeTime > 0 || voiceTime > 0 || messages > 0 || commands > 0;
      });

      const sortedStaff = eligible.sort((a, b) => {
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
      await sendDailyReport(message.guild);
      await performDailyReset();

      const nowOptions = { timeZone: "Asia/Kolkata", hour12: false };
      const istDateString = new Intl.DateTimeFormat("en-US", { ...nowOptions, dateStyle: "short" }).format(new Date());
      await saveLastReportDate(istDateString);
      await saveLastResetDate(istDateString);

      console.log(`✅ [ManualReset] Activity data force-reset by ${message.author.tag} at ${new Date().toISOString()} (marked as reset for ${istDateString} IST).`);
      await message.channel.send("✅ Activity tracking has been reset. Fresh tracking starts now.");
      return;
    }

    // Admin-only, explicit, single-target removal — the ONLY way a record
    // ever gets deleted. Use this for banned/removed members.
    // Usage: .removeuser <userID>
    if (commandName === "removeuser") {
      const hasAdmin = message.member.permissions.has("Administrator");
      const hasRole = message.member.roles.cache.has(ATLOGS_ROLE_ID);

      if (!hasAdmin && !hasRole) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You do not have permission to use this command.")] });
      }

      const targetId = words[0] && words[0].replace(/[<@!>]/g, "");
      if (!targetId || !/^\d{15,25}$/.test(targetId)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Usage: `.removeuser <userID>` — provide a valid Discord user ID (or mention them).")] });
      }

      try {
        await removeUserRecord(targetId);
        console.log(`✅ [RemoveUser] ${message.author.tag} removed activetime record for ${targetId}.`);
        return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✅ Removed activetime record for \`${targetId}\`.`)] });
      } catch (err) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription(`❌ Failed to remove record for \`${targetId}\`. Check the logs.`)] });
      }
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