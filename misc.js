const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
      // AVATAR COMMAND (No Prefix)
      // ==========================
      if (firstWord === "av" || firstWord === "avatar") {
        let targetUser = message.author;
        let targetMember = message.member;

        const arg = tokens[1];
        if (arg) {
          const cleanedId = arg.replace(/<@!?(\d+)>/, "$1");
          try {
            targetUser = await client.users.fetch(cleanedId);
            targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
          } catch (err) {
            return message.reply({ embeds: [makeEmbed("Red", "Could not find a user with that ID or mention.")] });
          }
        }

        const avatarURL = targetUser.displayAvatarURL({ size: 4096, dynamic: true });
        const bannerURL = targetUser.bannerURL({ size: 4096, dynamic: true });

        let acknowledgment = "Member";
        if (message.guild.ownerId === targetUser.id) {
          acknowledgment = "Server Owner";
        } else if (targetMember) {
          if (targetMember.permissions.has("Administrator")) {
            acknowledgment = "Administrator";
          } else if (targetMember.permissions.has("ManageMessages") || targetMember.permissions.has("KickMembers") || targetMember.permissions.has("BanMembers")) {
            acknowledgment = "Moderator";
          } else if (targetUser.bot) {
            acknowledgment = "Bot Account";
          }
        }

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle(`${targetUser.username}'s Profile and Avatar`)
          .setDescription(`User ID: \`${targetUser.id}\`\nAcknowledgment: ${acknowledgment}`)
          .setImage(avatarURL)
          .addFields(
            { name: "Account Created", value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
            targetMember && targetMember.joinedTimestamp ? { name: "Server Joined", value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true } : { name: "Server Joined", value: "Unknown", inline: true },
            { name: "Has Banner?", value: bannerURL ? "Yes (Check Profile)" : "No Banner", inline: true }
          )
          .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();

        if (bannerURL) {
          embed.setThumbnail(bannerURL);
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("PNG Format")
            .setStyle(ButtonStyle.Link)
            .setURL(targetUser.displayAvatarURL({ extension: "png", size: 4096 })),
          new ButtonBuilder()
            .setLabel("JPG Format")
            .setStyle(ButtonStyle.Link)
            .setURL(targetUser.displayAvatarURL({ extension: "jpg", size: 4096 })),
          new ButtonBuilder()
            .setLabel("WebP Format")
            .setStyle(ButtonStyle.Link)
            .setURL(targetUser.displayAvatarURL({ extension: "webp", size: 4096 }))
        );

        if (avatarURL.includes(".gif")) {
          row.addComponents(
            new ButtonBuilder()
              .setLabel("GIF Format")
              .setStyle(ButtonStyle.Link)
              .setURL(targetUser.displayAvatarURL({ extension: "gif", size: 4096 }))
          );
        }

        return message.reply({ embeds: [embed], components: [row] });
      }


      // ==========================
      // USER INFO (No Prefix)
      // ==========================
      if (firstWord === "ui" || firstWord === "userinfo") {
        let targetUser = message.author;
        let targetMember = message.member;

        const arg = tokens[1];
        if (arg) {
          const cleanedId = arg.replace(/<@!?(\d+)>/, "$1");
          try {
            targetUser = await client.users.fetch(cleanedId);
            targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
          } catch (err) {
            return message.reply({ embeds: [makeEmbed("Red", "Could not find a user with that ID or mention.")] });
          }
        }

        let acknowledgment = "Member";
        if (message.guild.ownerId === targetUser.id) {
          acknowledgment = "Server Owner";
        } else if (targetMember) {
          if (targetMember.permissions.has("Administrator")) {
            acknowledgment = "Administrator";
          } else if (targetMember.permissions.has("ManageMessages") || targetMember.permissions.has("KickMembers") || targetMember.permissions.has("BanMembers")) {
            acknowledgment = "Moderator";
          } else if (targetUser.bot) {
            acknowledgment = "Bot Account";
          }
        }

        const uiEmbed = new EmbedBuilder()
          .setColor("Blue")
          .setAuthor({
            name: targetUser.tag,
            iconURL: targetUser.displayAvatarURL({ dynamic: true })
          })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setTitle("User Information Profile")
          .addFields(
            { name: "User ID", value: `\`${targetUser.id}\``, inline: true },
            { name: "Acknowledgment", value: acknowledgment, inline: true },
            { name: "Highest Role", value: targetMember ? `${targetMember.roles.highest}` : "None", inline: true },
            { name: "Joined Discord", value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Joined Server", value: targetMember && targetMember.joinedTimestamp ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true }
          )
          .setTimestamp();

        return message.reply({ embeds: [uiEmbed] });
      }


      // ==========================
      // SERVER INFO (No Prefix)
      // ==========================
      if (firstWord === "si" || firstWord === "serverinfo") {
        const guild = message.guild;
        await guild.fetchOwner();

        const totalChannels = guild.channels.cache.size;
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        const categoryChannels = guild.channels.cache.filter(c => c.type === 4).size;

        const totalRoles = guild.roles.cache.size;
        const totalEmojis = guild.emojis.cache.size;
        const totalStickers = guild.stickers.cache.size;

        const verificationLevels = {
          0: "None",
          1: "Low (Verified Email)",
          2: "Medium (Registered 5+ mins)",
          3: "High (Member 10+ mins)",
          4: "Highest (Verified Phone)"
        };

        const boostTierMap = {
          0: "None",
          1: "Tier 1",
          2: "Tier 2",
          3: "Tier 3"
        };

        const siEmbed = new EmbedBuilder()
          .setColor("Purple")
          .setTitle(`${guild.name} - Server Information`)
          .setThumbnail(guild.iconURL({ dynamic: true, size: 4096 }))
          .setImage(guild.bannerURL({ size: 4096 }))
          .addFields(
            { name: "Server ID", value: `\`${guild.id}\``, inline: true },
            { name: "Server Owner", value: `<@${guild.ownerId}>`, inline: true },
            { name: "Created On", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: false },
            { name: "Members", value: `Total: **${guild.memberCount}**`, inline: true },
            { name: "Verification", value: `${verificationLevels[guild.verificationLevel]}`, inline: true },
            { name: "Boost Status", value: `${boostTierMap[guild.premiumTier]} (${guild.premiumSubscriptionCount || 0} Boosts)`, inline: true },
            { name: `Channels (${totalChannels})`, value: `Text: **${textChannels}** | Voice: **${voiceChannels}** | Categories: **${categoryChannels}**`, inline: false },
            { name: "System Specs", value: `Roles: **${totalRoles}** | Emojis: **${totalEmojis}** | Stickers: **${totalStickers}**`, inline: false },
            { name: "Features", value: guild.features.length > 0 ? `\`${guild.features.slice(0, 8).join("`, `")}\`` : "None", inline: false }
          )
          .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();

        return message.reply({ embeds: [siEmbed] });
      }


      // ==========================
      // STICKY COMMAND (Keeps Prefix '.')
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
