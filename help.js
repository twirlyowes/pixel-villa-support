const {
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    PermissionsBitField
} = require("discord.js");
const db = require("./firebase");


const GUILD_ID = "1510176142286389329";
const TICKET_CATEGORY_ID = "1538537441441357947";
const LOGS_CHANNEL_ID = "1510571308952326189";

const SUPPORT_ROLES = {
    minecraft: "1518884608102498304",
    discord: "1522167715861889094",
    others: "1522167715861889094"
};

const CATEGORY_NAMES = {
    minecraft: "Minecraft",
    discord: "Discord",
    others: "Others"
};


async function getNextTicketId() {
    const counterRef = db.collection("modmail").doc("config");
    return await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterRef);
        let nextId = 1;
        if (doc.exists) {
            nextId = (doc.data().ticketCounter || 0) + 1;
        }
        transaction.set(counterRef, { ticketCounter: nextId }, { merge: true });
        return nextId;
    });
}

function padTicketId(id) {
    return String(id).padStart(4, "0");
}

function mergeOverwrite(list, id, allow = [], deny = []) {
    const idx = list.findIndex(o => o.id === id);
    if (idx !== -1) {
        list[idx].allow = new PermissionsBitField(list[idx].allow).add(allow).remove(deny);
        list[idx].deny = new PermissionsBitField(list[idx].deny).add(deny).remove(allow);
    } else {
        list.push({ id, allow, deny });
    }
}


function setupHelpCommand(client) {
    if (client.__pixelVillaHelpLoaded) return;
    client.__pixelVillaHelpLoaded = true;

    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot) return;

            if (!message.content) return;

            const args = message.content.trim().split(/ +/);
            const command = args[0].toLowerCase();

            if (command !== "help") return;

            const helpEmbed = new EmbedBuilder()
                .setColor("#5865F2")
                .setAuthor({
                    name: "Pixel Villa Support • Help Center",
                    iconURL: client.user.displayAvatarURL()
                })
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(
`<a:sparkles:1532986077651140620> **Welcome to Pixel Villa Support!**

Use the categories below to explore all available commands.

━━━━━━━━━━━━━━━━━━━━━━

<:Shield_2:1532989398642327594> **Prefixes**
> **Moderation:** \`.command\`
> **Utilities & Management:** \`command\``
                )
                .addFields(
                    {
                        name: "<a:ban:1532989769766801511> Moderation Commands",
                        value:
"```" +
".warn\n" +
".mute\n" +
".unmute\n" +
".kick\n" +
".ban\n" +
".unban\n" +
".nick\n" +
".lock\n" +
".unlock\n" +
".hide\n" +
".unhide\n" +
".wlist\n" +
".wremove\n" +
".wreset" +
"```",
                        inline: false
                    },
                    {
                        name: "<a:settings:1532990547394957393> Management Commands",
                        value:
"```" +
"role" +
"```",
                        inline: false
                    },
                    {
                        name: "<:terminal:1532991459005829264> Utility Commands",
                        value:
"```" +
"purge\n" +
"afk\n" +
"help\n" +
"ui\n" +
"si\n" +
"wiki\n" +
"calculate" +
"```",
                        inline: false
                    }
                )
                .setFooter({
                    text: "Pixel Villa Support • Help Module"
                })
                .setTimestamp();

            return message.reply({ embeds: [helpEmbed] });

        } catch (error) {
            console.error("Help Command Error:", error);
        }
    });
}


function setupModMail(client) {
    if (client.__pixelVillaModMailLoaded) return;
    client.__pixelVillaModMailLoaded = true;

    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot) return;

            if (message.channel.type === ChannelType.DM) {
                const userId = message.author.id;

                const existingTicketSnapshot = await db.collection("modmail_tickets")
                    .where("userId", "==", userId)
                    .where("status", "==", "open")
                    .get();

                if (!existingTicketSnapshot.empty) {
                    const ticketData = existingTicketSnapshot.docs[0].data();
                    const ticketChannel = await client.channels.fetch(ticketData.channelId).catch(() => null);

                    const forwardEmbed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                        .setDescription(message.content || "*[No Text Content]*")
                        .setTimestamp();

                    const files = message.attachments.map(att => att.url);

                    if (ticketChannel) {
                        await ticketChannel.send({ embeds: [forwardEmbed], files });
                    }
                    return;
                }

                const pendingRef = db.collection("modmail_pending").doc(userId);
                const pendingDoc = await pendingRef.get();
                let messagesList = [];
                if (pendingDoc.exists) {
                    messagesList = pendingDoc.data().messages || [];
                }
                messagesList.push({
                    content: message.content,
                    attachments: message.attachments.map(att => att.url),
                    timestamp: new Date().toISOString()
                });
                await pendingRef.set({ messages: messagesList }, { merge: true });

                const categoryEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("📨 Pixel Villa Support")
                    .setDescription("Welcome to Pixel Villa Support.\n\nPlease select the category that best matches your query.");

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("modmail_cat_minecraft").setLabel("Minecraft").setStyle(ButtonStyle.Primary).setEmoji("⛏️"),
                    new ButtonBuilder().setCustomId("modmail_cat_discord").setLabel("Discord").setStyle(ButtonStyle.Secondary).setEmoji("💬"),
                    new ButtonBuilder().setCustomId("modmail_cat_others").setLabel("Others").setStyle(ButtonStyle.Success).setEmoji("📩")
                );

                await message.reply({ embeds: [categoryEmbed], components: [row] }).catch(() => {});
                return;
            }

            if (message.guild && message.guild.id === GUILD_ID) {
                const ticketSnapshot = await db.collection("modmail_tickets")
                    .where("channelId", "==", message.channel.id)
                    .where("status", "==", "open")
                    .get();

                if (ticketSnapshot.empty) return;

                const ticketDoc = ticketSnapshot.docs[0];
                const ticketData = ticketDoc.data();

                const ticketUser = await client.users.fetch(ticketData.userId).catch(() => null);
                if (!ticketUser) return;

                const hideStaff = ticketData.hideStaffName === true;
                const staffEmbed = new EmbedBuilder()
                    .setColor(0xE67E22)
                    .setAuthor({
                        name: hideStaff ? "🛡️ Pixel Villa Support" : `🛡️ Staff (${message.author.tag})`,
                        iconURL: hideStaff ? client.user.displayAvatarURL() : message.author.displayAvatarURL()
                    })
                    .setDescription(message.content || "*[No Text Content]*")
                    .setTimestamp();

                const files = message.attachments.map(att => att.url);

                await ticketUser.send({ embeds: [staffEmbed], files }).catch(async () => {
                    await message.reply("⚠️ Could not send DM to the user. They might have DMs disabled.").catch(() => {});
                });
            }
        } catch (error) {
            console.error("Error in ModMail messageCreate handler:", error);
        }
    });

    client.on("interactionCreate", async (interaction) => {
        try {
            if (!interaction.isButton()) return;
            const customId = interaction.customId;

            if (customId.startsWith("modmail_cat_")) {
                await interaction.deferUpdate().catch(() => {});
                const userId = interaction.user.id;
                const categoryKey = customId.replace("modmail_cat_", "");

                const existingTicketSnapshot = await db.collection("modmail_tickets")
                    .where("userId", "==", userId)
                    .where("status", "==", "open")
                    .get();

                if (!existingTicketSnapshot.empty) {
                    await interaction.user.send("⚠️ You already have an active support ticket.").catch(() => {});
                    return;
                }

                const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
                if (!guild) {
                    await interaction.user.send("❌ I could not access the support server. Please try again later.").catch(() => {});
                    return;
                }

                let ticketIdNum;
                try {
                    ticketIdNum = await getNextTicketId();
                } catch (err) {
                    await interaction.user.send("❌ Something went wrong while creating your ticket. Please try again later.").catch(() => {});
                    return;
                }

                const formattedId = padTicketId(ticketIdNum);
                const channelName = `${categoryKey}-${formattedId}`;
                const supportRoleId = SUPPORT_ROLES[categoryKey];

                const ticketCategory = guild.channels.cache.get(TICKET_CATEGORY_ID)
                    || await guild.channels.fetch(TICKET_CATEGORY_ID).catch(() => null);

                let categoryOverwrites = [];
                if (ticketCategory && ticketCategory.type === ChannelType.GuildCategory) {
                    categoryOverwrites = ticketCategory.permissionOverwrites.cache.map(overwrite => ({
                        id: overwrite.id,
                        type: overwrite.type,
                        allow: overwrite.allow,
                        deny: overwrite.deny,
                    }));
                }

                mergeOverwrite(categoryOverwrites, guild.id, [], [PermissionFlagsBits.ViewChannel]);
                mergeOverwrite(categoryOverwrites, client.user.id, [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                ]);
                mergeOverwrite(categoryOverwrites, supportRoleId || guild.id, [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                ]);

                let ticketChannel;
                try {
                    ticketChannel = await guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        parent: TICKET_CATEGORY_ID,
                        permissionOverwrites: categoryOverwrites
                    });
                } catch (err) {
                    await interaction.user.send("❌ Failed to create your support ticket. Please try again later.").catch(() => {});
                    return;
                }

                const now = new Date().toISOString();
                await db.collection("modmail_tickets").doc(ticketChannel.id).set({
                    ticketId: ticketIdNum,
                    channelId: ticketChannel.id,
                    userId: userId,
                    category: categoryKey,
                    status: "open",
                    createdAt: now,
                    closedAt: null,
                    closedBy: null,
                    claimedBy: null,
                    hideStaffName: false
                });

                const pendingRef = db.collection("modmail_pending").doc(userId);
                const pendingDoc = await pendingRef.get();
                if (pendingDoc.exists) {
                    const messagesList = pendingDoc.data().messages || [];
                    for (const m of messagesList) {
                        const historyEmbed = new EmbedBuilder()
                            .setColor(0x3498DB)
                            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                            .setDescription(m.content || "*[No Text Content]*")
                            .setTimestamp(new Date(m.timestamp));
                        await ticketChannel.send({ embeds: [historyEmbed], files: m.attachments }).catch(() => {});
                    }
                    await pendingRef.delete().catch(() => {});
                }

                const ticketEmbed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle("📨 Pixel Villa Support")
                    .addFields(
                        { name: "User", value: `<@${userId}>`, inline: true },
                        { name: "User ID", value: userId, inline: true },
                        { name: "Category", value: CATEGORY_NAMES[categoryKey] || categoryKey, inline: true },
                        { name: "Ticket", value: `#${formattedId}`, inline: true },
                        { name: "Status", value: "🟢 Open", inline: true }
                    )
                    .setTimestamp();

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("modmail_close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
                    new ButtonBuilder().setCustomId("modmail_claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Primary).setEmoji("🙋"),
                    new ButtonBuilder().setCustomId("modmail_hide_staff").setLabel("Hide Staff Name").setStyle(ButtonStyle.Secondary).setEmoji("👤")
                );

                const rolePing = supportRoleId ? `<@&${supportRoleId}>` : "";
                await ticketChannel.send({ content: rolePing, embeds: [ticketEmbed], components: [actionRow] }).catch(() => {});

                const confirmEmbed = new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle("✅ Support Ticket Created")
                    .setDescription("Your support ticket has been successfully created.")
                    .addFields(
                        { name: "Ticket", value: `#${formattedId}`, inline: true },
                        { name: "Category", value: CATEGORY_NAMES[categoryKey] || categoryKey, inline: true }
                    )
                    .setFooter({ text: "Our support team will assist you shortly." })
                    .setTimestamp();

                await interaction.user.send({ embeds: [confirmEmbed] }).catch(() => {});

                const logsChannel = await client.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle("🎫 Ticket Created")
                        .addFields(
                            { name: "Ticket", value: `#${formattedId}`, inline: true },
                            { name: "User", value: `${interaction.user.tag} (${userId})`, inline: true },
                            { name: "Category", value: CATEGORY_NAMES[categoryKey] || categoryKey, inline: true },
                            { name: "Channel", value: `<#${ticketChannel.id}>`, inline: true }
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
                return;
            }

            if (customId === "modmail_claim") {
                await interaction.deferUpdate().catch(() => {});
                const channelId = interaction.channel.id;

                const ticketRef = db.collection("modmail_tickets").doc(channelId);
                const ticketDoc = await ticketRef.get();
                if (!ticketDoc.exists) return;

                const ticketData = ticketDoc.data();
                if (ticketData.status !== "open") return;

                const guild = interaction.guild;
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (!member) return;

                const requiredRole = SUPPORT_ROLES[ticketData.category];
                if (!member.permissions.has(PermissionFlagsBits.Administrator) && (!requiredRole || !member.roles.cache.has(requiredRole))) {
                    await interaction.followUp({ content: "❌ You do not have the required support role to claim this ticket.", ephemeral: true }).catch(() => {});
                    return;
                }

                if (ticketData.claimedBy) {
                    await interaction.followUp({ content: "⚠️ This ticket has already been claimed.", ephemeral: true }).catch(() => {});
                    return;
                }

                await ticketRef.update({ claimedBy: interaction.user.id });

                const fetchedMessages = await interaction.channel.messages.fetch({ limit: 10 }).catch(() => null);
                const targetMessage = fetchedMessages ? fetchedMessages.find(m => m.embeds.length > 0 && m.embeds[0].title === "📨 Pixel Villa Support") : null;

                if (targetMessage) {
                    const oldEmbed = targetMessage.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(oldEmbed).addFields(
                        { name: "🙋 Claimed By", value: `<@${interaction.user.id}>`, inline: false }
                    );
                    await targetMessage.edit({ embeds: [updatedEmbed], components: targetMessage.components }).catch(() => {});
                }

                const logsChannel = await client.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x3498DB)
                        .setTitle("🙋 Ticket Claimed")
                        .addFields(
                            { name: "Ticket", value: `#${padTicketId(ticketData.ticketId)}`, inline: true },
                            { name: "Claimed By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true }
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
                return;
            }

            if (customId === "modmail_hide_staff") {
                const channelId = interaction.channel.id;

                const ticketRef = db.collection("modmail_tickets").doc(channelId);
                const ticketDoc = await ticketRef.get();
                if (!ticketDoc.exists) return;

                const ticketData = ticketDoc.data();
                if (ticketData.status !== "open") return;

                const guild = interaction.guild;
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (!member) return;

                const requiredRole = SUPPORT_ROLES[ticketData.category];
                if (!member.permissions.has(PermissionFlagsBits.Administrator) && (!requiredRole || !member.roles.cache.has(requiredRole))) {
                    await interaction.reply({ content: "❌ You do not have the required support role to change this setting.", ephemeral: true }).catch(() => {});
                    return;
                }

                const currentHideState = ticketData.hideStaffName === true;
                const newHideState = !currentHideState;

                await ticketRef.update({ hideStaffName: newHideState });

                const fetchedMessages = await interaction.channel.messages.fetch({ limit: 10 }).catch(() => null);
                const targetMessage = fetchedMessages ? fetchedMessages.find(m => m.embeds.length > 0 && m.embeds[0].title === "📨 Pixel Villa Support") : null;

                if (targetMessage) {
                    const updatedRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("modmail_close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
                        new ButtonBuilder().setCustomId("modmail_claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Primary).setEmoji("🙋"),
                        new ButtonBuilder()
                            .setCustomId("modmail_hide_staff")
                            .setLabel(newHideState ? "Show Staff Name" : "Hide Staff Name")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(newHideState ? "👁️" : "👤")
                    );
                    await targetMessage.edit({ components: [updatedRow] }).catch(() => {});
                }

                const confirmationText = newHideState
                    ? "👤 Staff names will now be hidden from the user."
                    : "👁️ Staff names will now be shown to the user.";

                await interaction.reply({ content: confirmationText, ephemeral: true }).catch(() => {});
                return;
            }

            if (customId === "modmail_close") {
                await interaction.deferUpdate().catch(() => {});
                const channelId = interaction.channel.id;

                const ticketRef = db.collection("modmail_tickets").doc(channelId);
                const ticketDoc = await ticketRef.get();
                if (!ticketDoc.exists) return;

                const ticketData = ticketDoc.data();
                if (ticketData.status !== "open") return;

                const guild = interaction.guild;
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (!member) return;

                const requiredRole = SUPPORT_ROLES[ticketData.category];
                if (!member.permissions.has(PermissionFlagsBits.Administrator) && (!requiredRole || !member.roles.cache.has(requiredRole))) {
                    await interaction.followUp({ content: "❌ You do not have the required support role to close this ticket.", ephemeral: true }).catch(() => {});
                    return;
                }

                const now = new Date().toISOString();
                await ticketRef.update({
                    status: "closed",
                    closedAt: now,
                    closedBy: interaction.user.id
                });

                const formattedId = padTicketId(ticketData.ticketId);
                const ticketUser = await client.users.fetch(ticketData.userId).catch(() => null);

                if (ticketUser) {
                    const closeEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("🔒 Support Ticket Closed")
                        .setDescription(`Your Pixel Villa Support ticket #${formattedId} has been closed.\n\nIf you need further assistance, you can send the bot a new DM.`)
                        .setTimestamp();
                    await ticketUser.send({ embeds: [closeEmbed] }).catch(() => {});
                }

                const logsChannel = await client.channels.fetch(LOGS_CHANNEL_ID).catch(() => null);
                if (logsChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle("🔒 Ticket Closed")
                        .addFields(
                            { name: "Ticket", value: `#${formattedId}`, inline: true },
                            { name: "User", value: `<@${ticketData.userId}> (${ticketData.userId})`, inline: true },
                            { name: "Closed By", value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                            { name: "Created", value: ticketData.createdAt, inline: true },
                            { name: "Closed", value: now, inline: true }
                        )
                        .setTimestamp();
                    await logsChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }

                setTimeout(async () => {
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        await channel.delete().catch(() => {});
                    }
                }, 5000);
                return;
            }
        } catch (error) {
            console.error("Error in ModMail interactionCreate handler:", error);
        }
    });
}



module.exports = function (client) {
    setupHelpCommand(client);
    setupModMail(client);

};
