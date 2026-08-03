// Location: warn.js
const { EmbedBuilder } = require("discord.js");
const config = require("./config.json");
const { db } = require("./firebase");

// Helper functions to fetch and save warnings from/to firebase


async function getWarnings() {
  try {
    const snapshot = await db.collection("warnings").get();

    const warnings = {};

    snapshot.forEach(doc => {
      warnings[doc.id] = doc.data().warnings || [];
    });

    return warnings;

  } catch (error) {
    console.error("❌ Firebase warning load error:", error);
    return {};
  }
}


async function saveWarnings(warnings) {
  try {

    // Remove deleted users from Firebase
    const snapshot = await db.collection("warnings").get();

    for (const doc of snapshot.docs) {
      if (!warnings[doc.id]) {
        await db.collection("warnings").doc(doc.id).delete();
      }
    }

    // Save current warnings
    for (const [userId, userWarnings] of Object.entries(warnings)) {
      await db.collection("warnings").doc(userId).set({
        warnings: userWarnings
      });
    }

    console.log("✅ Warnings saved to Firebase");

  } catch (error) {
    console.error("❌ Firebase warning save error:", error);
  }
}
module.exports = (client) => {
  const PREFIX = ".";

  function makeEmbed(color, title, text) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: "Pixel Villa Support • Warning System",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(title)
    .setDescription(text)
    .setFooter({
      text: "Pixel Villa Support • Moderation"
    })
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
      return message.channel.send({
  embeds: [
    makeEmbed(
      "#E74C3C",
      "<a:error:1532986765105696778> Permission Denied",
      "You do not have permission to use this command."
    )
  ]
});
    }

    try {
      // 1. WARN COMMAND (.warn)
      if (command === "warn") {
        // Find the member explicitly typed in the message text, ignoring automatic reply pings
        const user = message.mentions.members.find(m => message.content.includes(m.id));
        const reason = args.slice(1).join(" ") || "No reason provided";

        if (!user) {
          return message.channel.send({
            embeds: [makeEmbed(
"Red",
"<a:error:1532986765105696778> Invalid Usage",
`**Usage:** \`${PREFIX}warn @user [reason]\``
)]
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
            .setTitle(`<a:Warning:1532986372716236932> Warning Received | ${message.guild.name}`)
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
    embeds: [
      makeEmbed(
        "#57F287",
        "<a:success:1532986625343099050> Clean Record",
        `<:Shield_2:1532989398642327594> **User**
> ${user}

<a:Warning:1532986372716236932> **Warnings**
> No warnings found.`
      )
    ]
  });
        }
        
        const embed = new EmbedBuilder()
  .setColor("#F1C40F")
  .setAuthor({
    name: "Pixel Villa Support • Warning History",
    iconURL: client.user.displayAvatarURL()
  })
  .setThumbnail(user.user.displayAvatarURL({ dynamic: true }))
  .setTitle("<a:Warning:1532986372716236932> Infraction History")
  .setDescription(
`<:Shield_2:1532989398642327594> **User**
> ${user}

<:Stats:1532990723408793661> **Total Warnings**
> ${userWarns.length}/5

━━━━━━━━━━━━━━━━━━━━━━`
  )
  .setFooter({
    text: "Pixel Villa Support • Moderation"
  })
  .setTimestamp();

        const recentWarns = userWarns.slice(-5).reverse();
        recentWarns.forEach((warn, index) => {
          embed.addFields({
            name: `<a:Warning:1532986372716236932> Warning #${userWarns.length - index} • ID: ${warn.id || "N/A"}`,
            value:
`<:Shield_2:1532989398642327594> **Moderator**
> ${warn.moderator}

<a:LP_Message:1532991009066324049> **Reason**
> ${warn.reason}

<a:Clock:1532990759371018372> **Date**
> <t:${Math.floor(new Date(warn.timestamp).getTime() / 1000)}:R>`
          });
        });

        await message.channel.send({ embeds: [embed] });
      }

      // 3. REMOVE SPECIFIC WARNING COMMAND (.wremove)
if (command === "wremove") {
  const user = message.mentions.members.first();

  if (!user) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> Invalid Usage",
          `**Usage:** \`${PREFIX}wremove @user <warning ID>\``
        )
      ]
    });
  }

  const warnId = args.find(arg => /^\d{6}$/.test(arg));

  if (!warnId) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> Missing Warning ID",
          `Please provide a valid Warning ID.\n\n**Usage:** \`${PREFIX}wremove @user <warning ID>\``
        )
      ]
    });
  }

  // Firebase load
  const warnings = await getWarnings();

  if (!warnings[user.id] || warnings[user.id].length === 0) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> No Warnings Found",
          `**${user.user.tag}** has no warnings to remove.`
        )
      ]
    });
  }

  const warnIndex = warnings[user.id].findIndex(
    warn => warn.id === warnId
  );

  if (warnIndex === -1) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> Warning Not Found",
          `No warning found with ID **${warnId}**.`
        )
      ]
    });
  }

  const removed = warnings[user.id].splice(warnIndex, 1)[0];

  // Remove user document if no warnings left
  if (warnings[user.id].length === 0) {
    delete warnings[user.id];
  }

  // Firebase save
  await saveWarnings(warnings);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setAuthor({
      name: "Pixel Villa Support • Warning System",
      iconURL: client.user.displayAvatarURL()
    })
    .setThumbnail(user.user.displayAvatarURL({ dynamic: true }))
    .setTitle("<a:success:1532986625343099050> Warning Removed")
    .setDescription(
`<:Shield_2:1532989398642327594> **User**
> ${user}

<a:Warning:1532986372716236932> **Warning ID**
> \`${removed.id}\`

<a:LP_Message:1532991009066324049> **Reason**
> ${removed.reason}

<:Shield_2:1532989398642327594> **Originally Warned By**
> ${removed.moderator}

<a:settings:1532990547394957393> **Removed By**
> ${message.author}

━━━━━━━━━━━━━━━━━━━━━━

<a:sparkles:1532986077651140620> Warning has been removed successfully.`
    )
    .setFooter({
      text: "Pixel Villa Support • Moderation"
    })
    .setTimestamp();

  await message.channel.send({
    embeds: [embed]
  });

  // Log channel
  if (config.LOG_CHANNEL_ID) {
    try {
      const logChannel = await message.guild.channels.fetch(config.LOG_CHANNEL_ID);

      if (logChannel) {
        await logChannel.send({
          embeds: [embed]
        });
      }

    } catch (err) {
      console.error("❌ Warning removal log error:", err);
    }
  }
        }

  // 4. RESET ALL WARNINGS COMMAND (.wreset)
if (command === "wreset") {
  const user = message.mentions.members.first();

  if (!user) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> Invalid Usage",
          `**Usage:** \`${PREFIX}wreset @user\``
        )
      ]
    });
  }

  // Firebase load
  const warnings = await getWarnings();

  if (!warnings[user.id] || warnings[user.id].length === 0) {
    return message.channel.send({
      embeds: [
        makeEmbed(
          "#E74C3C",
          "<a:error:1532986765105696778> No Warnings Found",
          `**${user.user.tag}** does not have any warnings to reset.`
        )
      ]
    });
  }

  // Remove warnings from Firebase data
  delete warnings[user.id];

  // Firebase save
  await saveWarnings(warnings);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setAuthor({
      name: "Pixel Villa Support • Warning System",
      iconURL: client.user.displayAvatarURL()
    })
    .setThumbnail(user.user.displayAvatarURL({ dynamic: true }))
    .setTitle("<a:success:1532986625343099050> Warning History Reset")
    .setDescription(
`<:Shield_2:1532989398642327594> **User**
> ${user}

<a:Warning:1532986372716236932> **Action**
> All warnings have been removed

<a:settings:1532990547394957393> **Reset By**
> ${message.author}

━━━━━━━━━━━━━━━━━━━━━━

<a:sparkles:1532986077651140620> Infraction history has been cleared successfully.`
    )
    .setFooter({
      text: "Pixel Villa Support • Moderation"
    })
    .setTimestamp();

  await message.channel.send({
    embeds: [embed]
  });

  // Log channel
  if (config.LOG_CHANNEL_ID) {
    try {
      const logChannel = await message.guild.channels.fetch(config.LOG_CHANNEL_ID);

      if (logChannel) {
        await logChannel.send({
          embeds: [embed]
        });
      }

    } catch (err) {
      console.error("❌ Warning reset log error:", err);
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
