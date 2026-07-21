const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const config = require("./config.json");

module.exports = (client) => {
  const PREFIX = ".";

  const stickyCache = new Map();

  function makeEmbed(color, text) {
    return new EmbedBuilder()
      .setColor(color)
      .setDescription(text)
      .setTimestamp();
  }

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const tokens = message.content.trim().split(/ +/);
    const firstWord = tokens[0].toLowerCase();

    try {

      // ==========================
      // AVATAR COMMAND
      // ==========================
      if (firstWord === "av") {
        const user = message.mentions.users.first() || message.author;

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle(`${user.username}'s Avatar`)
          .setImage(user.displayAvatarURL({ size: 4096, extension: "png" }))
          .setFooter({ text: `Requested by ${message.author.username}` })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }


      // ==========================
      // USER INFO
      // ==========================
      if (firstWord === "ui" || firstWord === "userinfo") {

        const member =
          message.mentions.members.find(m => message.content.includes(m.id))
          || message.member;

        const user = member.user;

        const uiEmbed = new EmbedBuilder()
          .setColor("Blue")
          .setAuthor({
            name: user.tag,
            iconURL: user.displayAvatarURL({ dynamic: true })
          })
          .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setTitle("User Information Profile")
          .addFields(
            {
              name: "User ID",
              value: `\`${user.id}\``,
              inline: true
            },
            {
              name: "Highest Role",
              value: `${member.roles.highest}`,
              inline: true
            },
            {
              name: "Joined Discord",
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`
            },
            {
              name: "Joined Server",
              value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            }
          )
          .setTimestamp();

        return message.reply({ embeds: [uiEmbed] });
      }


      // ==========================
      // SERVER INFO
      // ==========================
      if (firstWord === "si" || firstWord === "serverinfo") {

        const guild = message.guild;

        const siEmbed = new EmbedBuilder()
          .setColor("Purple")
          .setTitle(`${guild.name} - Server Analysis`)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .addFields(
            {
              name: "Server ID",
              value: `\`${guild.id}\``,
              inline: true
            },
            {
              name: "Guild Owner",
              value: `<@${guild.ownerId}>`,
              inline: true
            },
            {
              name: "Total Accounts",
              value: `**${guild.memberCount}** members`,
              inline: true
            },
            {
              name: "Total Channels",
              value: `**${guild.channels.cache.size}** channels`,
              inline: true
            },
            {
              name: "Configured Roles",
              value: `**${guild.roles.cache.size}** roles`,
              inline: true
            }
          )
          .setTimestamp();

        return message.reply({ embeds: [siEmbed] });
      }


      // ==========================
      // STICKY COMMAND
      // ==========================
      if (message.content.startsWith(PREFIX)) {

        const args = message.content
          .slice(PREFIX.length)
          .trim()
          .split(/ +/);

        const command = args.shift().toLowerCase();


        if (command === "sticky") {

          if (!message.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
          )) {
            return message.reply({
              embeds: [
                makeEmbed(
                  "Red",
                  "You need Manage Messages permission."
                )
              ]
            });
          }


          const stickyText = args.join(" ");

          if (!stickyText) {
            return message.reply({
              embeds: [
                makeEmbed(
                  "Red",
                  `Usage:\n${PREFIX}sticky [message]\n${PREFIX}sticky off`
                )
              ]
            });
          }


          if (stickyText.toLowerCase() === "off") {

            stickyCache.delete(message.channel.id);

            return message.reply({
              embeds: [
                makeEmbed(
                  "Green",
                  "Sticky message removed."
                )
              ]
            });
          }


          stickyCache.set(message.channel.id, {
            text: stickyText,
            lastMessageId: null,
            lock: false
          });


          await message.delete().catch(() => {});


          const embed = new EmbedBuilder()
            .setColor("Blurple")
            .setDescription(`Notice\n\n${stickyText}`)
            .setFooter({
              text: "Pinned Message"
            });


          const msg = await message.channel.send({
            embeds: [embed]
          });


          stickyCache.get(message.channel.id).lastMessageId = msg.id;
        }
      }


      // ==========================
      // STICKY ENGINE
      // ==========================
      const stickyData = stickyCache.get(message.channel.id);

      if (!stickyData || stickyData.lock) return;


      stickyData.lock = true;


      try {

        if (stickyData.lastMessageId) {

          const oldMsg =
            await message.channel.messages.fetch(
              stickyData.lastMessageId
            ).catch(() => null);


          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }


        const embed = new EmbedBuilder()
          .setColor("Blurple")
          .setDescription(`Notice\n\n${stickyData.text}`)
          .setFooter({
            text: "Pinned Message"
          });


        const newMsg =
          await message.channel.send({
            embeds: [embed]
          });


        stickyData.lastMessageId = newMsg.id;


      } finally {

        stickyData.lock = false;

      }


    } catch (error) {

      console.error(
        "Misc command error:",
        error
      );

    }

  });

};
