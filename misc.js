// Location: misc.js
const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const axios = require("axios");

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

    const rawContent = message.content.trim();

    // ==========================
    // 1. IP COMMAND (Exact match "ip")
    // ==========================
    if (rawContent.toLowerCase() === "ip") {
      return message.reply(
        "** Pixel Villa Server IP**\n\n" +
        "** Java Edition**\n" +
        "`mc.pixelvilla.fun:25575`\n\n" +
        "** Bedrock Edition**\n" +
        "**IP:** `mc.pixelvilla.fun`\n" +
        "**Port:** `25575`"
      );
    }

    const tokens = rawContent.split(/ +/);
    const firstWord = tokens[0].toLowerCase();

    // Support both dot-prefixed and non-prefixed commands cleanly
    const command = firstWord.startsWith(PREFIX) ? firstWord.slice(PREFIX.length) : firstWord;
    const words = [...tokens];
    words.shift(); // words array without the primary command word

    try {
      // ==========================
      // 2. AVATAR COMMAND ("av" or "avatar")
      // ==========================
      if (command === "av" || command === "avatar") {
        let targetUser = message.author;
        const arg = words[0];

        if (arg) {
          const cleanedId = arg.replace(/<@!?(\d+)>/, "$1");
          try {
            targetUser = await client.users.fetch(cleanedId);
          } catch (err) {
            return message.reply({ embeds: [makeEmbed("Red", "Could not find a user with that ID or mention.")] });
          }
        }

        const avatarURL = targetUser.displayAvatarURL({ size: 4096, dynamic: true });

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle(`${targetUser.username}'s Avatar`)
          .setImage(avatarURL)
          .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("PNG Format").setStyle(ButtonStyle.Link).setURL(targetUser.displayAvatarURL({ extension: "png", size: 4096 })),
          new ButtonBuilder().setLabel("JPG Format").setStyle(ButtonStyle.Link).setURL(targetUser.displayAvatarURL({ extension: "jpg", size: 4096 })),
          new ButtonBuilder().setLabel("WebP Format").setStyle(ButtonStyle.Link).setURL(targetUser.displayAvatarURL({ extension: "webp", size: 4096 }))
        );

        if (avatarURL.includes(".gif")) {
          row.addComponents(
            new ButtonBuilder().setLabel("GIF Format").setStyle(ButtonStyle.Link).setURL(targetUser.displayAvatarURL({ extension: "gif", size: 4096 }))
          );
        }

        return message.reply({ embeds: [embed], components: [row] });
      }

      // ==========================
      // 3. USER INFO COMMAND ("ui" or "userinfo")
      // ==========================
      if (command === "ui" || command === "userinfo") {
        let targetUser = message.author;
        let targetMember = message.member;

        const arg = words[0];
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
          .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
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
      // 4. SERVER INFO COMMAND ("si" or "serverinfo")
      // ==========================
      if (command === "si" || command === "serverinfo") {
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
      // 5. STICKY COMMAND (".sticky")
      // ==========================
      if (firstWord === ".sticky") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return message.reply({ embeds: [makeEmbed("Red", "You need Manage Messages permission.")] });
        }

        const stickyText = words.join(" ");
        if (!stickyText) {
          return message.reply({ embeds: [makeEmbed("Red", `Usage:\n${PREFIX}sticky [message]\n${PREFIX}sticky off`)] });
        }

        if (stickyText.toLowerCase() === "off") {
          stickyCache.delete(message.channel.id);
          return message.reply({ embeds: [makeEmbed("Green", "Sticky message removed.")] });
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
          .setFooter({ text: "Pinned Message" });

        const msg = await message.channel.send({ embeds: [embed] });
        stickyCache.get(message.channel.id).lastMessageId = msg.id;
        return;
      }

      // ==========================
      // 6. DM COMMAND (".dm")
      // ==========================
      if (firstWord === ".dm") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You need Administrator permissions to use this command.")] });
        }
        
        const targetUser = message.mentions.users.first() || message.guild.members.cache.get(words[0])?.user;
        const dmMessage = words.slice(1).join(" ");

        if (!targetUser || !dmMessage) {
          return message.reply({ embeds: [new EmbedBuilder().setColor("Yellow").setDescription("⚠️ Usage: `.dm @user [message]`")] });
        }

        try {
          await targetUser.send({ embeds: [new EmbedBuilder().setColor("#5865F2").setTitle("Direct Message").setDescription(dmMessage).setFooter({ text: `Sent from ${message.guild.name}` }).setTimestamp()] });
          await message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✅ Successfully sent a DM to **${targetUser.tag}**.`)] });
        } catch (err) {
          await message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ Could not send a DM to that user. They might have DMs disabled.")] });
        }
        return;
      }

      // ==========================
      // 7. BOTINFO COMMAND (".botinfo")
      // ==========================
      if (firstWord === ".botinfo") {
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const uptimeSec = Math.floor(client.uptime / 1000);
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);

        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle("🤖 Bot Information")
          .addFields(
            { name: "Bot Name", value: client.user.username, inline: true },
            { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
            { name: "Total Users", value: `${totalMembers}`, inline: true },
            { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
            { name: "Uptime", value: `${days}d ${hours}h ${minutes}m`, inline: true },
            { name: "Node.js", value: process.version, inline: true }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // ==========================
      // 8. WIKI COMMAND ("wiki")
      // ==========================
      if (command === "wiki") {
        const query = words.join(" ");
        if (!query) {
          return message.reply("⚠️ Please provide a search term for Wikipedia. Example: `wiki Albert Einstein`");
        }

        try {
          const headers = { "User-Agent": "PixelVillaBot/1.0 (DiscordBot)" };
          const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
          const searchRes = await axios.get(searchUrl, { headers });
          const searchResults = searchRes.data?.query?.search;

          if (!searchResults || searchResults.length === 0) {
            return message.reply("❌ Could not find a Wikipedia page matching that query.");
          }

          const pageTitle = searchResults[0].title;
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
          const res = await axios.get(summaryUrl, { headers });
          const data = res.data;

          const embed = new EmbedBuilder()
            .setColor("#FFFFFF")
            .setTitle(data.title || pageTitle)
            .setURL(data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`)
            .setDescription(data.extract || "No summary available.")
            .setFooter({ text: "Provided by Wikipedia" });

          if (data.thumbnail?.source) {
            embed.setThumbnail(data.thumbnail.source);
          }

          return message.reply({ embeds: [embed] });
        } catch (err) {
          return message.reply("❌ An error occurred while searching Wikipedia.");
        }
      }

      // ==========================
      // 9. HIDE COMMAND (".hide")
      // ==========================
      if (firstWord === ".hide") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You need Manage Channels permission to hide this channel.")] });
        }

        try {
          await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
          await message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔒 This channel has been hidden from regular members.")] });
        } catch (err) {
          await message.reply("❌ Failed to hide the channel.");
        }
        return;
      }

      // ==========================
      // 10. UNHIDE COMMAND (".unhide")
      // ==========================
      if (firstWord === ".unhide") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You need Manage Channels permission to unhide this channel.")] });
        }

        try {
          await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
          await message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔓 This channel is now visible to regular members.")] });
        } catch (err) {
          await message.reply("❌ Failed to unhide the channel.");
        }
        return;
      }

      // ==========================
      // 11. SAY COMMAND (".say")
      // ==========================
      if (firstWord === ".say") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You need Manage Messages permission to use .say.")] });
        }

        const text = words.join(" ");
        if (!text) {
          return message.reply("⚠️ Please provide text for the bot to say.");
        }

        await message.delete().catch(() => {});

        const sayEmbed = new EmbedBuilder()
          .setColor("#5865F2")
          .setDescription(text)
          .setTimestamp();

        return message.channel.send({ embeds: [sayEmbed] });
      }

      // ==========================
      // 12. CALCULATE COMMAND ("calculate")
      // ==========================
      if (command === "calculate") {
        const expr = words.join("");
        if (!expr) {
          return message.reply("⚠️ Please provide a math expression to calculate. Example: `calculate 5+5*2`");
        }

        if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
          return message.reply("❌ Invalid characters in expression. Only basic arithmetic (+, -, *, /, parentheses) is allowed.");
        }

        try {
          const result = Function(`'use strict'; return (${expr})`)();
          return message.reply(`🧮 Result: **${result}**`);
        } catch (err) {
          return message.reply("❌ Error evaluating the mathematical expression.");
        }
      }

      // ==========================
      // STICKY ENGINE CHECK
      // ==========================
      const stickyData = stickyCache.get(message.channel.id);
      if (!stickyData || stickyData.lock) return;

      stickyData.lock = true;

      try {
        if (stickyData.lastMessageId) {
          const oldMsg = await message.channel.messages.fetch(stickyData.lastMessageId).catch(() => null);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }

        const embed = new EmbedBuilder()
          .setColor("Blurple")
          .setDescription(`Notice\n\n${stickyData.text}`)
          .setFooter({ text: "Pinned Message" });

        const newMsg = await message.channel.send({ embeds: [embed] });
        stickyData.lastMessageId = newMsg.id;
      } finally {
        stickyData.lock = false;
      }

    } catch (error) {
      console.error("Misc command error:", error);
    }
  });
};
