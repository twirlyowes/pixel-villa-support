// Location: extracmds.js
const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const axios = require("axios");

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();
    const words = rawContent.split(/ +/);
    const command = words.shift().toLowerCase();

    // 1. .dm [user] [message]
    if (command === ".dm") {
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

    // 2. .botinfo
    if (command === ".botinfo") {
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

    // 3. wiki (no prefix)
    if (command === "wiki") {
      const query = words.join(" ");
      if (!query) {
        return message.reply("⚠️ Please provide a search term for Wikipedia. Example: `wiki Albert Einstein`");
      }

      try {
        // Step 1: Search Wikipedia to get the best matching page title
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchRes = await axios.get(searchUrl);
        const searchResults = searchRes.data?.query?.search;

        if (!searchResults || searchResults.length === 0) {
          return message.reply("❌ Could not find a Wikipedia page matching that query.");
        }

        // Get the top matching page title
        const pageTitle = searchResults[0].title;

        // Step 2: Fetch the summary using the correct page title
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
        const res = await axios.get(summaryUrl);
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

    // 4. .hide
    if (command === ".hide") {
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

    // 5. .unhide
    if (command === ".unhide") {
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

    // 6. .say
    if (command === ".say") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You need Manage Messages permission to use .say.")] });
      }

      const text = words.join(" ");
      if (!text) {
        return message.reply("⚠️ Please provide text for the bot to say.");
      }

      await message.delete().catch(() => {});
      return message.channel.send(text);
    }

    // 7. calculate (no prefix)
    if (command === "calculate") {
      const expr = words.join("");
      if (!expr) {
        return message.reply("⚠️ Please provide a math expression to calculate. Example: `calculate 5+5*2`");
      }

      // Safe evaluation check allowing only numbers, basic operators, parentheses, and decimals
      if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
        return message.reply("❌ Invalid characters in expression. Only basic arithmetic (+, -, *, /, parentheses) is allowed.");
      }

      try {
        // Safe evaluation
        const result = Function(`'use strict'; return (${expr})`)();
        return message.reply(`🧮 Result: **${result}**`);
      } catch (err) {
        return message.reply("❌ Error evaluating the mathematical expression.");
      }
    }
  });
};
