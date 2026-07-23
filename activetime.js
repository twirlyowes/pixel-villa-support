// Location: activetime.js
const { EmbedBuilder } = require("discord.js");
const config = require("./config.json");

// CONFIGURATION: Specific staff role ID for this tracker
const STAFF_ROLE_ID = "1511051007772069929"; 

// CONFIGURATION: Managers only channel ID for daily report logs
const LOG_CHANNEL_ID = "1527723455913660468"; 

// Active session tracker: Map<UserId, StartTimestamp>
const activeSessions = new Map();

// In-memory stats storage for the current day: Map<UserId, TotalTimeInMs>
const dailyActiveTimes = new Map();

module.exports = (client) => {

  const isStaff = (member) => {
    return member && member.roles && member.roles.cache.has(STAFF_ROLE_ID);
  };

  client.on("ready", () => {
    const now = Date.now();
    client.guilds.cache.forEach(guild => {
      guild.members.cache.forEach(member => {
        if (!member.user.bot && isStaff(member) && member.presence && member.presence.status !== "offline") {
          activeSessions.set(member.id, now);
        }
      });
    });

    // Schedule the report to trigger specifically at 3:00 AM every day
    scheduleDailyReset(client);
  });

  // Function to calculate time remaining until the next 3:00 AM and schedule it
  function scheduleDailyReset(clientInstance) {
    const now = new Date();
    const target = new Date();
    
    // Set target time to 3:00 AM
    target.setHours(3, 0, 0, 0);

    // If it's already past 3:00 AM today, schedule it for 3:00 AM tomorrow
    if (now >= target) {
      target.setDate(target.getDate() + 1);
    }

    const timeUntilTarget = target.getTime() - now.getTime();

    setTimeout(() => {
      sendDailyReport(clientInstance);
      // After it runs, set a recurring 24-hour interval for every subsequent day at 3:00 AM
      setInterval(() => {
        sendDailyReport(clientInstance);
      }, 24 * 60 * 60 * 1000);
    }, timeUntilTarget);
  }

  // Function to compile and auto-send daily report without tagging
  async function sendDailyReport(clientInstance) {
    try {
      const guild = clientInstance.guilds.cache.first();
      const channel = await clientInstance.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!channel || !guild) return;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("📊 Daily Staff Activity Report (3:00 AM Reset)")
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

      dailyActiveTimes.clear();
    } catch (err) {
      console.error("Error sending daily staff activity report:", err);
    }
  }

  // 1. Track presence updates (Online / Idle / DND) specifically for Staff
  client.on("presenceUpdate", (oldPresence, newPresence) => {
    const member = newPresence.member;
    if (!member || member.user.bot || !isStaff(member)) return;

    const userId = member.id;
    const oldStatus = oldPresence ? oldPresence.status : "offline";
    const newStatus = newPresence.status;

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
      }
    }
  });

  // 2. Command to check staff active time manually (`activetime`)
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();
    const words = rawContent.split(/ +/);
    const command = words[0].toLowerCase();

    if (command === "activetime") {
      const targetMember = message.mentions.members.first() || message.member;

      if (!isStaff(targetMember)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ That user is not a staff member or does not have the specified staff role.")] });
      }

      const userId = targetMember.id;
      let totalTime = dailyActiveTimes.get(userId) || 0;
      
      if (activeSessions.has(userId)) {
        totalTime += (Date.now() - activeSessions.get(userId));
      }

      const totalSeconds = Math.floor(totalTime / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const embed = new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle("⏱️ Staff Active Time Tracker (Today)")
        .setDescription(`Active presence duration for staff **${targetMember.user.username}**:\n\n**${hours} hours, ${minutes} minutes, ${seconds} seconds**`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }
  });
};
