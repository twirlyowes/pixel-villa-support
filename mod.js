const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const config = require("./config.json");

module.exports = (client) => {
  const PREFIX = ".";
  const startTime = Date.now(); 

  function makeEmbed(color, text, user = null) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(text)
    .setTimestamp();

  if (user) {
    embed.setFooter({
      text: `Requested by ${user.tag}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    });
  }

  return embed;
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
if (command === "kick") {
  if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You don't have permission to use this command.",
          message.author
        )
      ]
    });
  }

  const user = message.mentions.members.find(m => message.content.includes(m.id));
  const reason = args.slice(1).join(" ") || "No reason provided";

  if (!user) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#FEE75C",
          `<a:Warning:1532986372716236932> **Usage:** \`${PREFIX}kick @user [reason]\``,
          message.author
        )
      ]
    });
  }

  if (!user.kickable) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> I cannot kick this user. They may have a higher role than me or have Administrator permissions.",
          message.author
        )
      ]
    });
  }

  if (!hierarchyCheck(message, user)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You cannot kick this user because they have an equal or higher role than you.",
          message.author
        )
      ]
    });
  }

  await user.kick(reason);

  const embed = makeEmbed(
    "#F39C12",
    `<:kick:1532337429426471044> **Member Kicked**

**User:** ${user.user.tag} (\`${user.id}\`)
**Reason:** ${reason}
**Moderator:** ${message.author}`,
    message.author
  );

  await message.reply({ embeds: [embed] });
  await sendLog(message.guild, embed);
}

if (command === "ban") {
  if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You don't have permission to use this command.",
          message.author
        )
      ]
    });
  }

  const user = message.mentions.members.find(m => message.content.includes(m.id));
  const reason = args.slice(1).join(" ") || "No reason provided";

  if (!user) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#FEE75C",
          `<a:Warning:1532986372716236932> **Usage:** \`${PREFIX}ban @user [reason]\``,
          message.author
        )
      ]
    });
  }

  if (!user.bannable) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> I cannot ban this user. They may have a higher role than me or have Administrator permissions.",
          message.author
        )
      ]
    });
  }

  if (!hierarchyCheck(message, user)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You cannot ban this user because they have an equal or higher role than you.",
          message.author
        )
      ]
    });
  }

  await user.ban({ reason });

  const embed = makeEmbed(
    "#ED4245",
    `<a:ban:1532989769766801511> **Member Banned**

**User:** ${user.user.tag} (\`${user.id}\`)
**Reason:** ${reason}
**Moderator:** ${message.author}`,
    message.author
  );

  await message.reply({ embeds: [embed] });
  await sendLog(message.guild, embed);
      }

      if (command === "nick") {
        if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
          return message.reply("u cannot use this command");
        }

        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const nickname = args.slice(1).join(" ");

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

if (command === "ping") {
  const sent = await message.reply({
    embeds: [
      makeEmbed(
        "#5865F2",
        "<a:loading:1532985888118931517> Measuring latency...",
        message.author
      )
    ]
  });

  const latency = sent.createdTimestamp - message.createdTimestamp;
  const apiLatency = Math.round(client.ws.ping);

  const embed = makeEmbed(
    "#57F287",
    `<a:ONLINE:1532986890519711815> **Pong!**

**Roundtrip Latency:** \`${latency}ms\`
**API Latency:** \`${apiLatency}ms\``,
    message.author
  );

  await sent.edit({ embeds: [embed] });
}

if (command === "uptime") {
  const uptime = Date.now() - startTime;
  const totalSeconds = Math.floor(uptime / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const timestamp = Math.floor(startTime / 1000);

  const embed = new EmbedBuilder()
    .setTitle("Pixel Villa Uptime")
    .setDescription(
      `**I am online from** <t:${timestamp}:R>\n\n` +
      `**Total Uptime:** ${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds\n\n` +
      `**Started:** <t:${timestamp}:F>\n\n` +
      `Requested by ${message.author}`
    )
    .setColor("#5865F2");

  await message.reply({ embeds: [embed] });
}

if (command === "lock") {
  if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You don't have permission to use this command.",
          message.author
        )
      ]
    });
  }

  const channel = message.channel;

  await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
    SendMessages: false
  });

  const embed = makeEmbed(
    "#ED4245",
    `<:lock:1532337641494937651> **Channel Locked**

**Channel:** ${channel}
**Moderator:** ${message.author}`,
    message.author
  );

  await message.reply({ embeds: [embed] });
  await sendLog(message.guild, embed);
}

if (command === "unlock") {
  if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You don't have permission to use this command.",
          message.author
        )
      ]
    });
  }

  const channel = message.channel;

  await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
    SendMessages: null
  });

  const embed = makeEmbed(
    "#57F287",
    `<:unlock:1532337553217294528> **Channel Unlocked**

**Channel:** ${channel}
**Moderator:** ${message.author}`,
    message.author
  );

  await message.reply({ embeds: [embed] });
  await sendLog(message.guild, embed);
          }

    

if (command === "unban") {
  if (!message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> You don't have permission to use this command.",
          message.author
        )
      ]
    });
  }

  const userId = args[0];

  if (!userId) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#FEE75C",
          `<a:Warning:1532986372716236932> **Usage:** \`${PREFIX}unban [User ID]\``,
          message.author
        )
      ]
    });
  }

  const banInfo = await message.guild.bans.fetch(userId).catch(() => null);

  if (!banInfo) {
    return message.reply({
      embeds: [
        makeEmbed(
          "#ED4245",
          "<a:error:1532986765105696778> This user is not banned or the provided ID is invalid.",
          message.author
        )
      ]
    });
  }

  await message.guild.members.unban(userId);

  const embed = makeEmbed(
    "#57F287",
    `<a:success:1532986625343099050> **Member Unbanned**

**User:** ${banInfo.user.tag} (\`${banInfo.user.id}\`)
**Moderator:** ${message.author}`,
    message.author
  );

  await message.reply({ embeds: [embed] });
  await sendLog(message.guild, embed);
}

} catch (error) {
  console.error(`Error executing moderation command (${command}):`, error);

  message.reply({
    embeds: [
      makeEmbed(
        "#ED4245",
        "<a:error:1532986765105696778> An unexpected error occurred while executing this command.",
        message.author
      )
    ]
  }).catch(() => {});
}
});
};
