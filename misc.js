const {
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} = require("discord.js");
const axios = require("axios");
const { COLORS, createCard, getAvatarURL } = require("./lib/pixelVillaUI");

// Colors used here that aren't in the shared COLORS set
const WARNING_YELLOW = 0xFEE75C;
const PURPLE = 0x9B59B6;
const BLURPLE = 0x5865F2;
const WHITE = 0xFFFFFF;

module.exports = (client) => {
  const PREFIX = ".";
  const stickyCache = new Map();

  function cardReply(color, content, avatarURL = null, avatarDescription = "Pixel Villa Support") {
    return {
      components: [
        createCard({ color, content, avatarURL, avatarDescription })
      ],
      flags: MessageFlags.IsComponentsV2
    };
  }

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();

    if (rawContent.toLowerCase() === "ip") {
        try {
            await message.channel.send(
                cardReply(
                    COLORS.SKY_BLUE,
                    `# <:HOME:1532991400503673055> Pixel Villa Server IP\n\n` +
                    `<a:sparkles:1532986077651140620> **Java Edition**\n` +
                    `<:Link:1532991169984991302> **IP:** \`mc.pixelvilla.fun:25575\`\n\n` +
                    `<a:sparkles:1532986077651140620> **Bedrock Edition**\n` +
                    `<:Link:1532991169984991302> **IP:** \`mc.pixelvilla.fun\`\n` +
                    `<:terminal:1532991459005829264> **Port:** \`25575\`\n\n` +
                    `-# Requested by ${message.author.tag}`,
                    client.user.displayAvatarURL({ extension: "png", size: 128 }),
                    "Pixel Villa Support"
                )
            );
        } catch (err) {
            console.error("[IP Command] Failed to send card:", err);
        }

        return;
    }

    const tokens = rawContent.split(/ +/);
    const firstWord = tokens[0].toLowerCase();

    const command = firstWord.startsWith(PREFIX) ? firstWord.slice(PREFIX.length) : firstWord;
    const words = [...tokens];
    words.shift();

    try {
      if (command === "av" || command === "avatar") {
        let targetUser = message.author;
        const arg = words[0];

        if (arg) {
          const cleanedId = arg.replace(/<@!?(\d+)>/, "$1");
          try {
            targetUser = await client.users.fetch(cleanedId);
          } catch (err) {
            return message.reply(cardReply(COLORS.RED, "Could not find a user with that ID or mention."));
          }
        }

        const avatarURL = targetUser.displayAvatarURL({ size: 4096, dynamic: true });

        const container = new ContainerBuilder()
          .setAccentColor(BLURPLE)
          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `# ${targetUser.tag}'s Avatar\n-# Requested by ${message.author.tag}`
                )
              )
              .setThumbnailAccessory(
                new ThumbnailBuilder()
                  .setURL(targetUser.displayAvatarURL({ extension: "png", size: 128 }))
                  .setDescription(`${targetUser.tag}'s avatar`)
              )
          )
          .addSeparatorComponents(new SeparatorBuilder())
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder()
                .setURL(avatarURL)
                .setDescription(`${targetUser.tag}'s avatar`)
            )
          );

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

        return message.reply({
          components: [container, row],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (command === "ui" || command === "userinfo") {
      let targetUser = message.author;
let targetMember = message.member;

const arg = words[0];
if (arg) {
  const cleanedId = arg.replace(/<@!?(\d+)>/, "$1");

  try {
    targetUser = await client.users.fetch(cleanedId, { force: true });
    targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
  } catch {
    return message.reply(
      cardReply(
        COLORS.RED,
        "<a:error:1532986765105696778> Could not find a user with that ID or mention."
      )
    );
  }
}

await targetUser.fetch(true);

let acknowledgment = "Member";

if (message.guild.ownerId === targetUser.id) {
  acknowledgment = "Server Owner";
} else if (targetUser.bot) {
  acknowledgment = "Bot Account";
} else if (targetMember) {
  if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator)) {
    acknowledgment = "Server Administrator";
  } else if (
    targetMember.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    targetMember.permissions.has(PermissionsBitField.Flags.KickMembers) ||
    targetMember.permissions.has(PermissionsBitField.Flags.BanMembers)
  ) {
    acknowledgment = "Server Moderator";
  }
}

const nickname = targetMember?.nickname || "None";
const highestRole = targetMember?.roles.highest || "None";
const color =
  targetMember?.displayHexColor && targetMember.displayHexColor !== "#000000"
    ? targetMember.displayHexColor
    : "#000000";

const roleList = targetMember
  ? targetMember.roles.cache
      .filter((r) => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`)
      .join(", ")
  : "None";

const roleCount = targetMember
  ? targetMember.roles.cache.filter((r) => r.id !== message.guild.id).size
  : 0;

const keyPermissions = targetMember
  ? targetMember.permissions
      .toArray()
      .map((p) =>
        p
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (c) => c.toUpperCase())
      )
      .join(", ")
  : "None";

const flags = await targetUser.fetchFlags();

const badgeMap = {
  ActiveDeveloper: "🧑‍💻 Active Developer",
  BugHunterLevel1: "🐛 Bug Hunter",
  BugHunterLevel2: "🐞 Bug Hunter Level 2",
  CertifiedModerator: "🛡️ Moderator Programs",
  HypeSquadOnlineHouse1: "🏠 HypeSquad Bravery",
  HypeSquadOnlineHouse2: "🏡 HypeSquad Brilliance",
  HypeSquadOnlineHouse3: "🏘️ HypeSquad Balance",
  Hypesquad: "🎉 HypeSquad Events",
  Partner: "🤝 Discord Partner",
  PremiumEarlySupporter: "🌟 Early Supporter",
  Staff: "👑 Discord Staff",
  VerifiedBot: "🤖 Verified Bot",
  VerifiedDeveloper: "💻 Early Verified Bot Developer"
};

const badges = flags.toArray().length
  ? flags.toArray().map((f) => badgeMap[f] || f).join(", ")
  : "<a:error:1532986765105696778> No User Badges";

const botStatus = targetUser.bot
  ? "<a:success:1532986625343099050> Yes"
  : "<a:error:1532986765105696778> No";

const accentColor =
  targetMember?.displayHexColor && targetMember.displayHexColor !== "#000000"
    ? parseInt(targetMember.displayHexColor.replace("#", ""), 16)
    : COLORS.SKY_BLUE;

const infoText =
`<:Stats:1532990723408793661> **User Information**

**Username:** ${targetUser.username}
**User ID:** ${targetUser.id}
**Nickname:** ${nickname}
**Bot:** ${botStatus}
**Discord Badges:** ${badges}
**Account Created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>
**Server Joined:** ${
      targetMember?.joinedTimestamp
        ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`
        : "Unknown"
    }
**Highest Role:** ${highestRole}
**Color:** ${color}
**Roles [${roleCount}]:** ${
      roleList.length > 900 ? roleList.substring(0, 900) + "..." : roleList
    }

**Key Permissions**
${
      keyPermissions.length > 900
        ? keyPermissions.substring(0, 900) + "..."
        : keyPermissions
    }

**Acknowledgement**
${acknowledgment}`;

const container = new ContainerBuilder()
  .setAccentColor(accentColor)
  .addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# ${targetUser.tag}`)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(targetUser.displayAvatarURL({ extension: "png", size: 256, dynamic: true }))
          .setDescription(`${targetUser.tag}'s avatar`)
      )
  )
  .addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));

const bannerURL = targetUser.bannerURL({ size: 4096, dynamic: true });
if (bannerURL) {
  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(bannerURL)
          .setDescription(`${targetUser.tag}'s banner`)
      )
    );
}

container.addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Requested by ${message.author.tag}`)
  );

return message.reply({
  components: [container],
  flags: MessageFlags.IsComponentsV2
});
      }

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

        const infoText =
`**Server ID:** \`${guild.id}\`
**Server Owner:** <@${guild.ownerId}>

**Created On:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)

**Members:** Total: **${guild.memberCount}**
**Verification:** ${verificationLevels[guild.verificationLevel]}
**Boost Status:** ${boostTierMap[guild.premiumTier]} (${guild.premiumSubscriptionCount || 0} Boosts)

**Channels (${totalChannels})**
Text: **${textChannels}** | Voice: **${voiceChannels}** | Categories: **${categoryChannels}**

**System Specs**
Roles: **${totalRoles}** | Emojis: **${totalEmojis}** | Stickers: **${totalStickers}**

**Features**
${guild.features.length > 0 ? `\`${guild.features.slice(0, 8).join("\`, \`")}\`` : "None"}`;

        const iconURL = guild.iconURL({ extension: "png", size: 256, dynamic: true });

        const container = new ContainerBuilder().setAccentColor(PURPLE);

        if (iconURL) {
          container.addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${guild.name} - Server Information`)
              )
              .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(iconURL).setDescription(`${guild.name} icon`)
              )
          );
        } else {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${guild.name} - Server Information`)
          );
        }

        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText));

        const bannerURL = guild.bannerURL({ size: 4096 });
        if (bannerURL) {
          container
            .addSeparatorComponents(new SeparatorBuilder())
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder()
                  .setURL(bannerURL)
                  .setDescription(`${guild.name} banner`)
              )
            );
        }

        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Requested by ${message.author.tag}`)
          );

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (firstWord === ".sticky") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return message.reply(cardReply(COLORS.RED, "You need Manage Messages permission."));
        }

        const stickyText = words.join(" ");
        if (!stickyText) {
          return message.reply(cardReply(COLORS.RED, `Usage:\n${PREFIX}sticky [message]\n${PREFIX}sticky off`));
        }

        if (stickyText.toLowerCase() === "off") {
          stickyCache.delete(message.channel.id);
          return message.reply(cardReply(COLORS.GREEN, "Sticky message removed."));
        }

        stickyCache.set(message.channel.id, {
          text: stickyText,
          lastMessageId: null,
          lock: false
        });

        await message.delete().catch(() => {});

        const msg = await message.channel.send(
          cardReply(BLURPLE, `**Notice**\n\n${stickyText}\n\n-# Pinned Message`)
        );
        stickyCache.get(message.channel.id).lastMessageId = msg.id;
        return;
      }

      if (firstWord === ".dm") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply(cardReply(COLORS.RED, "❌ You need Administrator permissions to use this command."));
        }
        
        const targetUser = message.mentions.users.first() || message.guild.members.cache.get(words[0])?.user;
        const dmMessage = words.slice(1).join(" ");

        if (!targetUser || !dmMessage) {
          return message.reply(cardReply(WARNING_YELLOW, "⚠️ Usage: `.dm @user [message]`"));
        }

        try {
          await targetUser.send(
            cardReply(
              BLURPLE,
              `# Direct Message\n\n${dmMessage}\n\n-# Sent from ${message.guild.name}`
            )
          );
          await message.reply(cardReply(COLORS.GREEN, `✅ Successfully sent a DM to **${targetUser.tag}**.`));
        } catch (err) {
          await message.reply(cardReply(COLORS.RED, "❌ Could not send a DM to that user. They might have DMs disabled."));
        }
        return;
      }

      if (firstWord === ".botinfo") {
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const uptimeSec = Math.floor(client.uptime / 1000);
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);

        return message.reply(
          cardReply(
            BLURPLE,
            `# 🤖 Bot Information\n\n` +
            `**Bot Name**\n${client.user.username}\n\n` +
            `**Servers**\n${client.guilds.cache.size}\n\n` +
            `**Total Users**\n${totalMembers}\n\n` +
            `**Ping**\n${client.ws.ping}ms\n\n` +
            `**Uptime**\n${days}d ${hours}h ${minutes}m\n\n` +
            `**Node.js**\n${process.version}`,
            client.user.displayAvatarURL({ extension: "png", size: 128 }),
            "Pixel Villa Support"
          )
        );
      }

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

          const pageURL = data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;

          const headerText = new TextDisplayBuilder().setContent(
            `# [${data.title || pageTitle}](${pageURL})\n\n${data.extract || "No summary available."}`
          );

          const container = new ContainerBuilder().setAccentColor(WHITE);

          if (data.thumbnail?.source) {
            container.addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(headerText)
                .setThumbnailAccessory(
                  new ThumbnailBuilder()
                    .setURL(data.thumbnail.source)
                    .setDescription(data.title || pageTitle)
                )
            );
          } else {
            container.addTextDisplayComponents(headerText);
          }

          container
            .addSeparatorComponents(new SeparatorBuilder())
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Provided by Wikipedia"));

          return message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (err) {
          return message.reply("❌ An error occurred while searching Wikipedia.");
        }
      }

      if (firstWord === ".hide") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> You need the **Manage Channels** permission to use this command.")
    );
  }

  try {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { ViewChannel: false }
    );

    await message.reply(
      cardReply(COLORS.GREEN, "<:hide:1532336151854190743> This channel is now hidden from **@everyone**.")
    );
  } catch (err) {
    await message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> Failed to hide this channel.")
    );
  }

  return;
        }

     if (firstWord === ".unhide") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> You need the **Manage Channels** permission to use this command.")
    );
  }

  try {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { ViewChannel: null }
    );

    await message.reply(
      cardReply(COLORS.GREEN, "<:unhide:1532336276164841482> This channel is now visible to **@everyone**.")
    );
  } catch (err) {
    await message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> Failed to unhide this channel.")
    );
  }
  return;
       }
if (firstWord === ".say") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> You need the **Manage Messages** permission to use this command.")
    );
  }
  const text = words.join(" ");
  if (!text) {
    return message.reply(
      cardReply(WARNING_YELLOW, "<a:Warning:1532986372716236932> Please provide a message for me to send.")
    );
  }
  await message.delete().catch(() => {});
  return message.channel.send(cardReply(BLURPLE, text));
}
if (command === "calculate") {
  const expr = words.join("");
  if (!expr) {
    return message.reply(
      cardReply(WARNING_YELLOW, "<a:Warning:1532986372716236932> Please provide a mathematical expression.\nExample: `calculate 5+5*2`")
    );
  }
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    return message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> Invalid characters detected.\nOnly `+ - * / ( )` and numbers are allowed.")
    );
  }
  try {
    const result = Function(`'use strict'; return (${expr})`)();
    return message.reply(
      cardReply(
        COLORS.GREEN,
        `<:Stats:1532990723408793661> **Calculator**\n\n**Expression:** \`${expr}\`\n**Result:** \`${result}\``
      )
    );
  } catch {
    return message.reply(
      cardReply(COLORS.RED, "<a:error:1532986765105696778> Failed to evaluate the mathematical expression.")
    );
  }
}
      const stickyData = stickyCache.get(message.channel.id);
      if (!stickyData || stickyData.lock) return;
      stickyData.lock = true;
      try {
        if (stickyData.lastMessageId) {
          const oldMsg = await message.channel.messages
            .fetch(stickyData.lastMessageId)
            .catch(() => null);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }
        const newMsg = await message.channel.send(
          cardReply(
            BLURPLE,
            `<a:LP_Message:1532991009066324049> **Sticky Message**\n\n${stickyData.text}\n\n-# Pinned Message`
          )
        );
        stickyData.lastMessageId = newMsg.id;
      } finally {
        stickyData.lock = false;
      }
    } catch (error) {
      console.error("Misc command error:", error);
    }
  });
};