// Location: activetime.js
const { EmbedBuilder } = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

const STAFF_ROLE_ID = "1511051007772069929"; 
const LOG_CHANNEL_ID = "1527723455913660468"; 
const ACTIVE_TIME_FILE = path.join(__dirname, "activetimes.json");

const activeSessions = new Map();
let dailyActiveTimes = new Map();

(async () => {
  try {
    await fs.access(ACTIVE_TIME_FILE);
  } catch {
    await fs.writeFile(ACTIVE_TIME_FILE, "{}", "utf8");
  }
})();

async function loadSavedTimes() {
  try {
    const data = await fs.readFile(ACTIVE_TIME_FILE, "utf8");
    const json = JSON.parse(data);
    dailyActiveTimes = new Map(Object.entries(json).map(([k, v]) => [k, Number(v)]));
  } catch (error) {
    console.error("Error reading activetimes.json:", error);
    dailyActiveTimes = new Map();
  }
}

async function saveTimesToFile() {
  try {
    const obj = Object.fromEntries(dailyActiveTimes);
    await fs.writeFile(ACTIVE_TIME_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving activetimes.json:", error);
  }
}

module.exports = (client) => {

  const isStaff = (member) => {
    return member && member.roles && member.roles.cache.has(STAFF_ROLE_ID);
  };

  client.once("ready", async () => {
    await loadSavedTimes();
    const now = Date.now();
    
    client.guilds.cache.forEach(guild => {
      guild.members.cache.forEach(member => {
        if (!member.user.bot && isStaff(member)) {
          const status = member.presence ? member.presence.status : "offline";
          if (status !== "offline") {
            activeSessions.set(member.id, now);
          }
        }
      });
    });

    scheduleDailyReport(client);
  });

  function scheduleDailyReport(clientInstance) {
    const now = new Date();
    
    let targetUTC = new Date(now);
    targetUTC.setUTCHours(3, 0, 0, 0);
    targetUTC.setTime(targetUTC.getTime() - (5 * 60 + 30) * 60 * 1000);

    if (now >= targetUTC) {
      targetUTC.setDate(targetUTC.getDate() + 1);
    }

    const timeUntilTarget = targetUTC.getTime() - now.getTime();

    setTimeout(() => {
      executeDailyRoutine(clientInstance);
      setInterval(() => {
        executeDailyRoutine(clientInstance);
      }, 24 * 60 * 60 * 1000);
    }, timeUntilTarget);
  }

  async function executeDailyRoutine(clientInstance) {
    await sendDailyReport(clientInstance);

    setTimeout(async () => {
      dailyActiveTimes.clear();
      await saveTimesToFile();
      console.log("Daily active times data has been safely cleared and saved to JSON 5 minutes after report generation.");
    }, 5 * 60 * 1000);
  }

  async function sendDailyReport(clientInstance) {
    try {
      const guild = clientInstance.guilds.cache.first();
      const channel = await clientInstance.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!channel || !guild) return;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("📊 Daily Staff Activity Report (3:00 AM IST)")
        .setDescription("Here is the total active online time recorded for staff members over the past 24 hours:")
        .setTimestamp();

      let reportText = "";

      const now = Date.now();
      for (const [userId, startTime] of activeSessions.entries()) {
        const duration = now - startTime;
        const currentTotal = dailyActiveTimes.get(userId) || 0;
        dailyActiveTimes.set(userId, currentTotal + duration);
        activeSessions.set(userId, now);
      }

      if (dailyActiveTimes.size === 0) {
        reportText = "No active staff time recorded today.";
      } else {
        for (const [userId, totalTime] of dailyActiveTimes.entries()) {
          const totalSeconds = Math.floor(totalTime / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          
          const member = await guild.members.fetch(userId).catch(() => null);
          const name = member ? member.user.username : "Unknown User";

          reportText += `**${name}**: **${hours}h ${minutes}m**\n`;
        }
      }

      embed.addFields({ name: "Staff Durations", value: reportText, inline: false });
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("Error sending daily staff activity report:", err);
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
    } 
    else if (!isNowActive && wasActive) {
      if (activeSessions.has(userId)) {
        const startTime = activeSessions.get(userId);
        const duration = Date.now() - startTime;
        
        const currentTotal = dailyActiveTimes.get(userId) || 0;
        dailyActiveTimes.set(userId, currentTotal + duration);
        
        activeSessions.delete(userId);
        await saveTimesToFile();
      }
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();
    const words = rawContent.split(/ +/);
    const command = words[0].toLowerCase();

    if (command === "activetime") {
      const targetMember = message.mentions.members.first() || message.member;

      if (!isStaff(targetMember)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("That user is not a staff member or does not have the specified staff role.")] });
      }

      const userId = targetMember.id;
      let totalTime = dailyActiveTimes.get(userId) || 0;
      
      if (activeSessions.has(userId)) {
        totalTime += (Date.now() - activeSessions.get(userId));
      } else {
        const currentStatus = targetMember.presence ? targetMember.presence.status : "offline";
        if (currentStatus !== "offline") {
          activeSessions.set(userId, Date.now());
        }
      }

      const totalSeconds = Math.floor(totalTime / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("Staff Active Time Tracker (Today)")
        .setDescription(`Active presence duration for staff **${targetMember.user.username}**:\n\n**${hours} hours, ${minutes} minutes, ${seconds} seconds**`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  });
};
