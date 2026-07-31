// Location: warn.js
const { EmbedBuilder } = require("discord.js");
const config = require("./config.json"); // Load config to read role and log channel IDs

// --- JSONBIN CONFIGURATION FOR WARNINGS ---
const BIN_ID = "6a61af41f5f4af5e29b43bac";
const API_KEY = "$2a$10$aCLBlkuqB51DVhDxNoqisureJOzr5ljUp6AyTncij4YryQSiAKPwa";
// ------------------------------------------

// Helper functions to fetch and save warnings from/to JSONBin
async function getWarnings() {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY }
    });
    const data = await response.json();
    return data.record || {};
  } catch (error) {
    console.error("Failed to fetch warnings from JSONBin:", error);
    return {};
  }
}

async function saveWarnings(warnings) {
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY
      },
      body: JSON.stringify(warnings)
    });
  } catch (error) {
    console.error("Failed to save warnings to JSONBin:", error);
  }
}

module.exports = (client) => {
  const PREFIX = ".";

  function makeEmbed(color, text) {
    return new EmbedBuilder()
      .setColor(color)
      .setDescription(text)
      .setTimestamp();
  }

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // List of warning commands handled in this file
    const warnCommands = ["warn", "wlist", "wremove", "wreset"];
    if (!warnCommands.includes(command)) return;

    // Check if the executor has the required Staff Role
    if (!config.STAFF_ROLE_ID || !message.member.roles.cache.has(config.STAFF_ROLE_ID)) {
      return message.channel.send("u cannot use this command");
    }

    try {
      // 1. WARN COMMAND (.warn)
      if (command === "warn") {
        // Find the member explicitly typed in the message text, ignoring automatic reply pings
        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const reason = args.slice(1).join(" ") || "No reason provided";

        if (!user) {
          return message.channel.send({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}warn @user [reason]`)]
          });
        }

        const warnings = await getWarnings();
        if (!warnings[user.id]) {
          warnings[user.id] = [];
        }

        // Generate a random 6-digit Warning ID
        const warnId = Math.floor(100000 + Math.random() * 900000).toString();
        const now = new Date();

        const newWarning = {
          id: warnId,
          moderator: message.author.tag,
          reason: reason,
          timestamp: now.toISOString()
        };

        warnings[user.id].push(newWarning);
        await saveWarnings(warnings);

        // Attempt to DM the warned user
        let dmedUser = "Yes";
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor("Yellow")
            .setTitle(`⚠️ Warning Received | ${message.guild.name}`)
            .setDescription(`You have received a warning in **${message.guild.name}**.\n\n**Reason:** ${reason}`)
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] });
        } catch (dmError) {
          dmedUser = "No (DMs Closed)";
        }

        // Generate matching Date string (e.g., "7/16/2026, 9:30:09 PM")
        const formattedDate = now.toLocaleString("en-US", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
          hour12: true
        });

        // Exact match of the screenshot's embed structure
        const warnEmbed = new EmbedBuilder()
          .setColor("#43b581") // Success/green color to match the checkmark
          .setTitle(`✅ ${user.user.username} has been warned.`)
          .addFields(
            { name: "Reason", value: reason },
            { name: "Warned by", value: `${message.author.username} (${message.author.id})` },
            { name: "Timestamp", value: formattedDate },
            { name: "Warning ID", value: warnId },
            { name: "Member Notified", value: dmedUser },
            { name: "Total Warnings", value: `${warnings[user.id].length}/5` }
          );

        // Send confirmation in current channel
        await message.channel.send({ embeds: [warnEmbed] });

        // FIX: Fetch the channel asynchronously instead of relying purely on memory cache
        if (config.LOG_CHANNEL_ID) {
          try {
            const logChannel = await message.guild.channels.fetch(config.LOG_CHANNEL_ID);
            if (logChannel) {
              await logChannel.send({ embeds: [warnEmbed] });
            }
          } catch (err) {
            console.error("Failed to fetch or send to staff log channel:", err);
          }
        }
      }

      // 2. WARNINGS LIST COMMAND (.wlist)
      if (command === "wlist") {
        const user = message.mentions.members.find(m => message.content.includes(m.id)) || message.member;
        const warnings = await getWarnings();
        const userWarns = warnings[user.id] || [];

        if (userWarns.length === 0) {
          return message.channel.send({
            embeds: [makeEmbed("Green", `**${user.user.tag}** has a clean record! (0 warnings)`)]
          });
        }
        const embed = new EmbedBuilder()
          .setColor("Yellow")
          .setTitle(`⚠️ Infraction History: ${user.user.tag}`)
          .setDescription(`Total Warnings: **${userWarns.length}**`)
          .setTimestamp();

        const recentWarns = userWarns.slice(-5).reverse();
        recentWarns.forEach((warn, index) => {
          embed.addFields({
            name: `Warning #${userWarns.length - index} (ID: ${warn.id || "N/A"})`,
            value: `**Mod:** ${warn.moderator}\n**Reason:** ${warn.reason}\n**Date:** <t:${Math.floor(new Date(warn.timestamp).getTime() / 1000)}:R>`
          });
        });

        await message.channel.send({ embeds: [embed] });
      }

      // 3. REMOVE SPECIFIC WARNING COMMAND (.wremove)
if (command === "wremove") {
  const user = message.mentions.members.first();

  if (!user) {
    return message.channel.send({
      embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}wremove @user <warning ID>`)]
    });
  }

  const warnId = args[1];

  if (!warnId) {
    return message.channel.send({
      embeds: [makeEmbed("Red", `**Please provide a Warning ID.**\n\nUsage: \`${PREFIX}wremove @user <warning ID>\``)]
    });
  }

  const warnings = await getWarnings();

  if (!warnings[user.id] || warnings[user.id].length === 0) {
    return message.channel.send({
      embeds: [makeEmbed("Red", `**${user.user.tag}** doesn't have any warnings to remove.`)]
    });
  }

  const warnIndex = warnings[user.id].findIndex(w => w.id === warnId);

  if (warnIndex === -1) {
    return message.channel.send({
      embeds: [makeEmbed("Red", `No warning found with ID **${warnId}**.`)]
    });
  }

  const removed = warnings[user.id].splice(warnIndex, 1)[0];

  if (warnings[user.id].length === 0) {
    delete warnings[user.id];
  }

  await saveWarnings(warnings);

  const embed = makeEmbed(
    "Green",
    `Successfully removed warning **${removed.id}** from **${user.user.tag}**.\n\n` +
    `**Reason:** ${removed.reason}\n` +
    `**Originally Warned By:** ${removed.moderator}\n` +
    `**Removed By:** ${message.author.tag}`
  );

  await message.channel.send({ embeds: [embed] });

  // Send to log channel
  if (config.LOG_CHANNEL_ID) {
    try {
      const logChannel = await message.guild.channels.fetch(config.LOG_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error("Failed to send warning removal log:", err);
    }
  }
    }      

      // 4. RESET ALL WARNINGS COMMAND (.wreset)
      if (command === "wreset") {
        const user = message.mentions.members.find(m => message.content.includes(m.id));
        if (!user) {
          return message.channel.send({
            embeds: [makeEmbed("Red", `**Usage:** ${PREFIX}wreset @user`)]
          });
        }

        const warnings = await getWarnings();
        if (!warnings[user.id] || warnings[user.id].length === 0) {
          return message.channel.send({
            embeds: [makeEmbed("Red", `**${user.user.tag}** doesn't have any warnings to reset.`)]
          });
        }
        delete warnings[user.id];
        await saveWarnings(warnings);

        const embed = makeEmbed(
          "Green",
          `Wiped all infraction history for **${user.user.tag}**.\n\n**Moderator:** ${message.author.tag}`
        );
        await message.channel.send({ embeds: [embed] });

        // FIX: Fetch the channel asynchronously instead of relying purely on memory cache
        if (config.LOG_CHANNEL_ID) {
          try {
            const logChannel = await message.guild.channels.fetch(config.LOG_CHANNEL_ID);
            if (logChannel) {
              await logChannel.send({ embeds: [embed] });
            }
          } catch (err) {
            console.error("Failed to fetch or send to staff log channel:", err);
          }
        }
      }
    } catch (error) {
      console.error("Error executing warning structure:", error);
      message.channel.send({
        embeds: [makeEmbed("Red", "An error occurred inside the warning system.")]
      }).catch(() => {});
    }
  });
};
