const {
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    PermissionsBitField,
    MessageFlags
} = require("discord.js");

const db = require("./firebase");

const {
    COLORS,
    createCard,
    getAvatarURL
} = require("./lib/pixelVillaUI");

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

        transaction.set(
            counterRef,
            { ticketCounter: nextId },
            { merge: true }
        );

        return nextId;
    });
}

function padTicketId(id) {
    return String(id).padStart(4, "0");
}

function mergeOverwrite(list, id, allow = [], deny = []) {
    const idx = list.findIndex(o => o.id === id);

    if (idx !== -1) {
        list[idx].allow = new PermissionsBitField(list[idx].allow)
            .add(allow)
            .remove(deny);

        list[idx].deny = new PermissionsBitField(list[idx].deny)
            .add(deny)
            .remove(allow);
    } else {
        list.push({
            id,
            allow,
            deny
        });
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

            const avatarURL = client.user.displayAvatarURL({
                extension: "png",
                size: 128
            });

            const helpContent =
`<a:sparkles:1532986077651140620> **Welcome to Pixel Villa Support!**

Use the categories below to explore all available commands.

<:Shield_2:1532989398642327594> **Prefixes**
> **Moderation:** \`.command\`
> **Utilities & Management:** \`command\`

<a:ban:1532989769766801511> **Moderation Commands**
\`\`\`
.warn
.mute
.unmute
.kick
.ban
.unban
.nick
.lock
.unlock
.hide
.unhide
.wlist
.wremove
.wreset
\`\`\`

<a:settings:1532990547394957393> **Management Commands**
\`\`\`
role
\`\`\`

<:terminal:1532991459005829264> **Utility Commands**
\`\`\`
purge
afk
help
ui
si
wiki
calculate
\`\`\`

-# Pixel Villa Support • Help Module`;

            const card = createCard({
                color: COLORS.SKY_BLUE,
                content: helpContent,
                avatarURL,
                avatarDescription: "Pixel Villa Support avatar"
            });

            await message.reply({
                components: [card],
                flags: MessageFlags.IsComponentsV2
            });

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

                const existingTicketSnapshot =
                    await db.collection("modmail_tickets")
                        .where("userId", "==", userId)
                        .where("status", "==", "open")
                        .get();

                if (!existingTicketSnapshot.empty) {
                    const ticketData =
                        existingTicketSnapshot.docs[0].data();

                    const ticketChannel =
                        await client.channels
                            .fetch(ticketData.channelId)
                            .catch(() => null);

                    if (!ticketChannel) return;

                    const content =
`<@${userId}> **${message.author.tag}**

${message.content || "*[No Text Content]*"}

-# Sent via Pixel Villa Support ModMail`;

                    const forwardCard = createCard({
                        color: COLORS.SKY_BLUE,
                        content,
                        avatarURL: getAvatarURL(message.author),
                        avatarDescription:
                            `${message.author.username}'s avatar`
                    });

                    const files =
                        message.attachments.map(att => att.url);

                    await ticketChannel.send({
                        components: [forwardCard],
                        flags: MessageFlags.IsComponentsV2,
                        files
                    });

                    return;
                }

                const pendingRef =
                    db.collection("modmail_pending").doc(userId);

                const pendingDoc =
                    await pendingRef.get();

                let messagesList = [];

                if (pendingDoc.exists) {
                    messagesList =
                        pendingDoc.data().messages || [];
                }

                messagesList.push({
                    content: message.content,
                    attachments:
                        message.attachments.map(att => att.url),
                    timestamp: new Date().toISOString()
                });

                await pendingRef.set(
                    {
                        messages: messagesList
                    },
                    {
                        merge: true
                    }
                );

                const categoryCard = createCard({
                    color: COLORS.SKY_BLUE,
                    content:
`# 📨 Pixel Villa Support

Welcome to Pixel Villa Support.

Please select the category that best matches your query.

<a:sparkles:1532986077651140620> **Choose a category below.**`,
                    avatarURL: getAvatarURL(message.author),
                    avatarDescription:
                        `${message.author.username}'s avatar`
                });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId("modmail_cat_minecraft")
                            .setLabel("Minecraft")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji("⛏️"),

                        new ButtonBuilder()
                            .setCustomId("modmail_cat_discord")
                            .setLabel("Discord")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji("💬"),

                        new ButtonBuilder()
                            .setCustomId("modmail_cat_others")
                            .setLabel("Others")
                            .setStyle(ButtonStyle.Success)
                            .setEmoji("📩")
                    );

                await message.reply({
                    components: [
                        categoryCard,
                        row
                    ],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => {});

                return;
            }

            if (
                message.guild &&
                message.guild.id === GUILD_ID
            ) {
                const ticketSnapshot =
                    await db.collection("modmail_tickets")
                        .where("channelId", "==", message.channel.id)
                        .where("status", "==", "open")
                        .get();

                if (ticketSnapshot.empty) return;

                const ticketData =
                    ticketSnapshot.docs[0].data();

                const ticketUser =
                    await client.users
                        .fetch(ticketData.userId)
                        .catch(() => null);

                if (!ticketUser) return;

                const hideStaff =
                    ticketData.hideStaffName === true;

                const staffName = hideStaff
                    ? "🛡️ Pixel Villa Support"
                    : `🛡️ Staff (${message.author.tag})`;

                const staffAvatar = hideStaff
                    ? client.user
                    : message.author;

                const staffCard = createCard({
                    color: COLORS.SKY_BLUE,
                    content:
`${staffName}

${message.content || "*[No Text Content]*"}

-# Pixel Villa Support • ModMail`,
                    avatarURL: getAvatarURL(staffAvatar),
                    avatarDescription: hideStaff
                        ? "Pixel Villa Support avatar"
                        : `${message.author.username}'s avatar`
                });

                const files =
                    message.attachments.map(att => att.url);

                await ticketUser.send({
                    components: [staffCard],
                    flags: MessageFlags.IsComponentsV2,
                    files
                }).catch(async () => {
                    await message.reply(
                        "⚠️ Could not send DM to the user. They might have DMs disabled."
                    ).catch(() => {});
                });
            }

        } catch (error) {
            console.error(
                "Error in ModMail messageCreate handler:",
                error
            );
        }
    });

    client.on("interactionCreate", async (interaction) => {
        try {
            if (!interaction.isButton()) return;

            const customId = interaction.customId;

            if (customId.startsWith("modmail_cat_")) {
                await interaction.deferUpdate().catch(() => {});

                const userId = interaction.user.id;

                const categoryKey =
                    customId.replace("modmail_cat_", "");

                const categoryName =
                    CATEGORY_NAMES[categoryKey] || categoryKey;

                const existingTicketSnapshot =
                    await db.collection("modmail_tickets")
                        .where("userId", "==", userId)
                        .where("status", "==", "open")
                        .get();

                if (!existingTicketSnapshot.empty) {
                    await interaction.user.send(
                        "⚠️ You already have an active support ticket."
                    ).catch(() => {});

                    return;
                }

                const guild =
                    await client.guilds
                        .fetch(GUILD_ID)
                        .catch(() => null);

                if (!guild) {
                    await interaction.user.send(
                        "❌ I could not access the support server. Please try again later."
                    ).catch(() => {});

                    return;
                }

                let ticketIdNum;

                try {
                    ticketIdNum =
                        await getNextTicketId();
                } catch (error) {
                    console.error(
                        "Ticket ID Error:",
                        error
                    );

                    await interaction.user.send(
                        "❌ Something went wrong while creating your ticket. Please try again later."
                    ).catch(() => {});

                    return;
                }

                const formattedId =
                    padTicketId(ticketIdNum);

                const channelName =
                    `${categoryKey}-${formattedId}`;

                const supportRoleId =
                    SUPPORT_ROLES[categoryKey];

                const ticketCategory =
                    guild.channels.cache.get(TICKET_CATEGORY_ID) ||
                    await guild.channels
                        .fetch(TICKET_CATEGORY_ID)
                        .catch(() => null);

                let categoryOverwrites = [];

                if (
                    ticketCategory &&
                    ticketCategory.type === ChannelType.GuildCategory
                ) {
                    categoryOverwrites =
                        ticketCategory.permissionOverwrites.cache.map(
                            overwrite => ({
                                id: overwrite.id,
                                type: overwrite.type,
                                allow: overwrite.allow,
                                deny: overwrite.deny
                            })
                        );
                }

                mergeOverwrite(
                    categoryOverwrites,
                    guild.id,
                    [],
                    [PermissionFlagsBits.ViewChannel]
                );

                mergeOverwrite(
                    categoryOverwrites,
                    client.user.id,
                    [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles
                    ]
                );

                if (supportRoleId) {
                    mergeOverwrite(
                        categoryOverwrites,
                        supportRoleId,
                        [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles
                        ]
                    );
                }

                let ticketChannel;

                try {
                    ticketChannel =
                        await guild.channels.create({
                            name: channelName,
                            type: ChannelType.GuildText,
                            parent: TICKET_CATEGORY_ID,
                            permissionOverwrites:
                                categoryOverwrites
                        });
                } catch (error) {
                    console.error(
                        "Ticket Channel Creation Error:",
                        error
                    );

                    await interaction.user.send(
                        "❌ Failed to create your support ticket. Please try again later."
                    ).catch(() => {});

                    return;
                }

                const now =
                    new Date().toISOString();

                await db.collection("modmail_tickets")
                    .doc(ticketChannel.id)
                    .set({
                        ticketId: ticketIdNum,
                        channelId: ticketChannel.id,
                        userId,
                        category: categoryKey,
                        status: "open",
                        createdAt: now,
                        closedAt: null,
                        closedBy: null,
                        claimedBy: null,
                        hideStaffName: false
                    });

                const pendingRef =
                    db.collection("modmail_pending")
                        .doc(userId);

                const pendingDoc =
                    await pendingRef.get();

                if (pendingDoc.exists) {
                    const messagesList =
                        pendingDoc.data().messages || [];

                    for (const m of messagesList) {
                        const historyCard =
                            createCard({
                                color: COLORS.SKY_BLUE,
                                content:
`${interaction.user.tag}

${m.content || "*[No Text Content]*"}

-# Previous ModMail Message`,
                                avatarURL:
                                    getAvatarURL(interaction.user),
                                avatarDescription:
                                    `${interaction.user.username}'s avatar`
                            });

                        await ticketChannel.send({
                            components: [historyCard],
                            flags: MessageFlags.IsComponentsV2,
                            files: m.attachments || []
                        }).catch(() => {});
                    }

                    await pendingRef.delete()
                        .catch(() => {});
                }

                const rolePing =
                    supportRoleId
                        ? `<@&${supportRoleId}>`
                        : "";

                const ticketContent =
`${rolePing}

# 📨 Pixel Villa Support

**User**
<@${userId}>

**User ID**
\`${userId}\`

**Category**
${categoryName}

**Ticket**
#${formattedId}

**Status**
🟢 Open

-# Ticket created successfully`;

                const ticketCard =
                    createCard({
                        color: COLORS.GREEN,
                        content: ticketContent,
                        avatarURL:
                            getAvatarURL(interaction.user),
                        avatarDescription:
                            `${interaction.user.username}'s avatar`
                    });

                const actionRow =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId("modmail_close")
                                .setLabel("Close Ticket")
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji("🔒"),

                            new ButtonBuilder()
                                .setCustomId("modmail_claim")
                                .setLabel("Claim Ticket")
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji("🙋"),

                            new ButtonBuilder()
                                .setCustomId("modmail_hide_staff")
                                .setLabel("Hide Staff Name")
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji("👤")
                        );

                await ticketChannel.send({
                    components: [
                        ticketCard,
                        actionRow
                    ],
                    flags: MessageFlags.IsComponentsV2
                }).catch(error => {
                    console.error(
                        "Ticket Message Error:",
                        error
                    );
                });

                const confirmationCard =
                    createCard({
                        color: COLORS.GREEN,
                        content:
`# ✅ Support Ticket Created

Your support ticket has been successfully created.

**Ticket:** #${formattedId}
**Category:** ${categoryName}

Our support team will assist you shortly.`,
                        avatarURL:
                            getAvatarURL(interaction.user),
                        avatarDescription:
                            `${interaction.user.username}'s avatar`
                    });

                await interaction.user.send({
                    components: [confirmationCard],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => {});

                const logsChannel =
                    await client.channels
                        .fetch(LOGS_CHANNEL_ID)
                        .catch(() => null);

                if (logsChannel) {
                    const logCard =
                        createCard({
                            color: COLORS.GREEN,
                            content:
`# 🎫 Ticket Created

**Ticket:** #${formattedId}
**User:** ${interaction.user.tag}
**User ID:** \`${userId}\`
**Category:** ${categoryName}
**Channel:** <#${ticketChannel.id}>`,
                            avatarURL:
                                getAvatarURL(interaction.user),
                            avatarDescription:
                                `${interaction.user.username}'s avatar`
                        });

                    await logsChannel.send({
                        components: [logCard],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => {});
                }

                return;
            }

            if (customId === "modmail_claim") {
                await interaction.deferUpdate().catch(() => {});

                const channelId =
                    interaction.channel.id;

                const ticketRef =
                    db.collection("modmail_tickets")
                        .doc(channelId);

                const ticketDoc =
                    await ticketRef.get();

                if (!ticketDoc.exists) return;

                const ticketData =
                    ticketDoc.data();

                if (ticketData.status !== "open") return;

                const guild =
                    interaction.guild;

                if (!guild) return;

                const member =
                    await guild.members
                        .fetch(interaction.user.id)
                        .catch(() => null);

                if (!member) return;

                const requiredRole =
                    SUPPORT_ROLES[ticketData.category];

                const isAdmin =
                    member.permissions.has(
                        PermissionFlagsBits.Administrator
                    );

                const hasSupportRole =
                    requiredRole &&
                    member.roles.cache.has(requiredRole);

                if (!isAdmin && !hasSupportRole) {
                    await interaction.followUp({
                        content:
                            "❌ You do not have the required support role to claim this ticket.",
                        ephemeral: true
                    }).catch(() => {});

                    return;
                }

                if (ticketData.claimedBy) {
                    await interaction.followUp({
                        content:
                            "⚠️ This ticket has already been claimed.",
                        ephemeral: true
                    }).catch(() => {});

                    return;
                }

                await ticketRef.update({
                    claimedBy: interaction.user.id
                });

                const claimCard =
                    createCard({
                        color: COLORS.GREEN,
                        content:
`# 🙋 Ticket Claimed

This ticket has been claimed by ${interaction.user}.`,
                        avatarURL:
                            getAvatarURL(interaction.user),
                        avatarDescription:
                            `${interaction.user.username}'s avatar`
                    });

                await interaction.channel.send({
                    components: [claimCard],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => {});

                const logsChannel =
                    await client.channels
                        .fetch(LOGS_CHANNEL_ID)
                        .catch(() => null);

                if (logsChannel) {
                    const logCard =
                        createCard({
                            color: COLORS.SKY_BLUE,
                            content:
`# 🙋 Ticket Claimed

**Ticket:** #${padTicketId(ticketData.ticketId)}
**Claimed By:** ${interaction.user.tag}
**User ID:** \`${interaction.user.id}\``,
                            avatarURL:
                                getAvatarURL(interaction.user),
                            avatarDescription:
                                `${interaction.user.username}'s avatar`
                        });

                    await logsChannel.send({
                        components: [logCard],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => {});
                }

                return;
            }

            if (customId === "modmail_hide_staff") {
                const channelId =
                    interaction.channel.id;

                const ticketRef =
                    db.collection("modmail_tickets")
                        .doc(channelId);

                const ticketDoc =
                    await ticketRef.get();

                if (!ticketDoc.exists) return;

                const ticketData =
                    ticketDoc.data();

                if (ticketData.status !== "open") return;

                const guild =
                    interaction.guild;

                if (!guild) return;

                const member =
                    await guild.members
                        .fetch(interaction.user.id)
                        .catch(() => null);

                if (!member) return;

                const requiredRole =
                    SUPPORT_ROLES[ticketData.category];

                const isAdmin =
                    member.permissions.has(
                        PermissionFlagsBits.Administrator
                    );

                const hasSupportRole =
                    requiredRole &&
                    member.roles.cache.has(requiredRole);

                if (!isAdmin && !hasSupportRole) {
                    await interaction.reply({
                        content:
                            "❌ You do not have the required support role to change this setting.",
                        ephemeral: true
                    }).catch(() => {});

                    return;
                }

                const currentHideState =
                    ticketData.hideStaffName === true;

                const newHideState =
                    !currentHideState;

                await ticketRef.update({
                    hideStaffName: newHideState
                });

                const confirmationCard =
                    createCard({
                        color: COLORS.SKY_BLUE,
                        content:
                            newHideState
                                ? `# 👤 Staff Name Hidden

Staff names will now be hidden from the user.`
                                : `# 👁️ Staff Name Visible

Staff names will now be shown to the user.`,
                        avatarURL:
                            getAvatarURL(interaction.user),
                        avatarDescription:
                            `${interaction.user.username}'s avatar`
                    });

                await interaction.reply({
                    components: [confirmationCard],
                    flags:
                        MessageFlags.IsComponentsV2 |
                        MessageFlags.Ephemeral
                }).catch(() => {});

                return;
            }

            if (customId === "modmail_close") {
                await interaction.deferUpdate().catch(() => {});

                const channelId =
                    interaction.channel.id;

                const ticketRef =
                    db.collection("modmail_tickets")
                        .doc(channelId);

                const ticketDoc =
                    await ticketRef.get();

                if (!ticketDoc.exists) return;

                const ticketData =
                    ticketDoc.data();

                if (ticketData.status !== "open") return;

                const guild =
                    interaction.guild;

                if (!guild) return;

                const member =
                    await guild.members
                        .fetch(interaction.user.id)
                        .catch(() => null);

                if (!member) return;

                const requiredRole =
                    SUPPORT_ROLES[ticketData.category];

                const isAdmin =
                    member.permissions.has(
                        PermissionFlagsBits.Administrator
                    );

                const hasSupportRole =
                    requiredRole &&
                    member.roles.cache.has(requiredRole);

                if (!isAdmin && !hasSupportRole) {
                    await interaction.followUp({
                        content:
                            "❌ You do not have the required support role to close this ticket.",
                        ephemeral: true
                    }).catch(() => {});

                    return;
                }

                const now =
                    new Date().toISOString();

                await ticketRef.update({
                    status: "closed",
                    closedAt: now,
                    closedBy: interaction.user.id
                });

                const formattedId =
                    padTicketId(ticketData.ticketId);

                const ticketUser =
                    await client.users
                        .fetch(ticketData.userId)
                        .catch(() => null);

                if (ticketUser) {
                    const closeCard =
                        createCard({
                            color: COLORS.RED,
                            content:
`# 🔒 Support Ticket Closed

Your Pixel Villa Support ticket **#${formattedId}** has been closed.

If you need further assistance, you can send the bot a new DM.`,
                            avatarURL:
                                getAvatarURL(interaction.user),
                            avatarDescription:
                                `${interaction.user.username}'s avatar`
                        });

                    await ticketUser.send({
                        components: [closeCard],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => {});
                }

                const logsChannel =
                    await client.channels
                        .fetch(LOGS_CHANNEL_ID)
                        .catch(() => null);

                if (logsChannel) {
                    const closeLogCard =
                        createCard({
                            color: COLORS.RED,
                            content:
`# 🔒 Ticket Closed

**Ticket:** #${formattedId}
**User:** <@${ticketData.userId}>
**User ID:** \`${ticketData.userId}\`
**Closed By:** ${interaction.user.tag}
**Closed By ID:** \`${interaction.user.id}\`
**Created:** ${ticketData.createdAt}
**Closed:** ${now}`,
                            avatarURL:
                                getAvatarURL(interaction.user),
                            avatarDescription:
                                `${interaction.user.username}'s avatar`
                        });

                    await logsChannel.send({
                        components: [closeLogCard],
                        flags: MessageFlags.IsComponentsV2
                    }).catch(() => {});
                }

                const closingCard =
                    createCard({
                        color: COLORS.RED,
                        content:
`# 🔒 Ticket Closed

This ticket will be deleted in **5 seconds**.`,
                        avatarURL:
                            getAvatarURL(interaction.user),
                        avatarDescription:
                            `${interaction.user.username}'s avatar`
                    });

                await interaction.channel.send({
                    components: [closingCard],
                    flags: MessageFlags.IsComponentsV2
                }).catch(() => {});

                setTimeout(async () => {
                    const channel =
                        await client.channels
                            .fetch(channelId)
                            .catch(() => null);

                    if (channel) {
                        await channel.delete()
                            .catch(() => {});
                    }
                }, 5000);

                return;
            }

        } catch (error) {
            console.error(
                "Error in ModMail interactionCreate handler:",
                error
            );
        }
    });
}

module.exports = function (client) {
    setupHelpCommand(client);
    setupModMail(client);
};