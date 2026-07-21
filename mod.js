const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const config = require("./config.json");

module.exports = (client) => {
  const PREFIX = ".";

  function makeEmbed(color, text) {
    return new EmbedBuilder()
      .setColor(color)
      .setDescription(text)
      .setTimestamp();
  }

  function hierarchyCheck(message, target) {
    if (target.id === message.author.id) return false;
    if (!message.member.roles.highest || !target.roles.highest) return true;
    return target.roles.highest.position < message.member.roles.highest.position;
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
      console.error("Failed to send moderation log:", err);
    }
  }

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // 1. KICK COMMAND (.kick)
      if (command === "kick") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const reason = args.slice(1).join(" ") || "No reason provided";

        if (!user) {
          return message.reply({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}kick @user [reason]`)]
          });
        }

        if (!user.kickable) {
          return message.reply({
            embeds: [makeEmbed("Red", "I cannot kick this user. They may have a higher role than me or administrative rights.")]
          });
        }

        if (!hierarchyCheck(message, user)) {
          return message.reply({
            embeds: [makeEmbed("Red", "You cannot kick this user due to role hierarchy.")]
          });
        }

        await user.kick(reason);

        const embed = makeEmbed(
          "Orange",
          `**${user.user.tag}** has been kicked from the server.\n\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

      // 2. BAN COMMAND (.ban)
      if (command === "ban") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const reason = args.slice(1).join(" ") || "No reason provided";

        if (!user) {
          return message.reply({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}ban @user [reason]`)]
          });
        }

        if (!user.bannable) {
          return message.reply({
            embeds: [makeEmbed("Red", "I cannot ban this user. They may have a higher role than me or administrative rights.")]
          });
        }

        if (!hierarchyCheck(message, user)) {
          return message.reply({
            embeds: [makeEmbed("Red", "You cannot ban this user due to role hierarchy.")]
          });
        }

        await user.ban({ reason: reason });

        const embed = makeEmbed(
          "Red",
          `**${user.user.tag}** has been permanently banned.\n\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

      // 3. NICKNAME COMMAND (.nick)
      if (command === "nick") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const nickname = args.slice(1).join(" "); // Empty string resets the nickname

        if (!user) {
          return message.reply({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}nick @user [new nickname / leave blank to reset]`)]
          });
        }

        if (!user.manageable) {
          return message.reply({
            embeds: [makeEmbed("Red", "I cannot change this user's nickname. They may have a higher role than me.")]
          });
        }

        if (!hierarchyCheck(message, user)) {
          return message.reply({
            embeds: [makeEmbed("Red", "You cannot change this user's nickname due to role hierarchy.")]
          });
        }

        await user.setNickname(nickname || null);

        const statusText = nickname ? `changed to **${nickname}**` : "reset to default";
        const embed = makeEmbed(
          "Blue",
          `**${user.user.tag}**'s nickname has been ${statusText}.\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

      // 4. PING COMMAND (.ping) - No staff role required
      if (command === "ping") {
        const sent = await message.reply("Calculating latency...");
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const embed = makeEmbed(
          "Green",
          `🏓 **Pong!**\n\n**Roundtrip Latency:** ${latency}ms\n**API Latency:** ${apiLatency}ms`
        );

        await sent.edit({ content: " ", embeds: [embed] });
      }

      // 5. UPTIME COMMAND (.uptime) - No staff role required
      if (command === "uptime") {
        const totalSeconds = Math.floor(client.uptime / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const timeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        const embed = makeEmbed("Green", `⏱️ **Bot Uptime:** \`${timeString}\``);

        await message.reply({ embeds: [embed] });
      }

      // 6. LOCK COMMAND (.lock)
      if (command === "lock") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const channel = message.channel;
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: false
        });

        const embed = makeEmbed(
          "Red",
          `🔒 **${channel.name}** has been locked down.\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

      // 7. UNLOCK COMMAND (.unlock)
      if (command === "unlock") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const channel = message.channel;
        await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: null // Resets to default/neutral inheritance state
        });

        const embed = makeEmbed(
          "Green",
          `🔓 **${channel.name}** is now unlocked.\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

      // 8. UNBAN COMMAND (.unban)
      if (command === "unban") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const userId = args[0];
        if (!userId) {
          return message.reply({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}unban [User ID]`)]
          });
        }

        // Attempting to fetch the ban record to confirm it exists
        const banInfo = await message.guild.bans.fetch(userId).catch(() => null);
        if (!banInfo) {
          return message.reply({
            embeds: [makeEmbed("Red", "This user is not banned, or the ID provided is invalid.")]
          });
        }

        await message.guild.members.unban(userId);

        const embed = makeEmbed(
          "Green",
          `**${banInfo.user.tag}** has been successfully unbanned.\n**Moderator:** ${message.author.tag}`
        );

        await message.reply({ embeds: [embed] });
        await sendLog(message.guild, embed);
      }

    } catch (error) {
      console.error(`Error executing moderation command (${command}):`, error);
      message.reply({
        embeds: [makeEmbed("Red", "An error occurred while attempting to execute this action.")]
      }).catch(() => {});
    }
  });
};
