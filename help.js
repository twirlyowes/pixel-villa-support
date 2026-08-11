"use strict";

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    GatewayIntentBits,
    Partials
} = require("discord.js");

/* =========================================================
   PIXEL VILLA SUPPORT — MODMAIL
   Compatible with:
       require("./help")(client);
   ========================================================= */

const MODMAIL_CONFIG = {
    guildId: "1510176142286389329",

    ticketCategoryId: "1521077017569656946",

    logsChannelId: "1510571308952326189",

    supportRoles: {
        minecraft: "1518884608102498304",
        discord: "1522167715861889094",
        others: "1522167715861889094"
    }
};

const CATEGORY_NAMES = {
    minecraft: "⛏️ Minecraft",
    discord: "💬 Discord",
    others: "📩 Others"
};

const VALID_CATEGORIES = ["minecraft", "discord", "others"];


/* =========================================================
   FIREBASE LOADER
   ========================================================= */

function loadFirestore() {
    const possiblePaths = [
        "./firebase",
        "./firebase.js",
        "../firebase",
        "./utils/firebase"
    ];

    for (const file of possiblePaths) {
        try {
            const firebase = require(file);

            if (firebase.firestore && typeof firebase.firestore === "function") {
                const db = firebase.firestore();

                if (db) {
                    console.log("[ModMail] Firestore loaded from " + file);
                    return db;
                }
            }

            if (firebase.db) {
                console.log("[ModMail] Firestore loaded from " + file);
                return firebase.db;
            }

            if (firebase.collection) {
                console.log("[ModMail] Firestore loaded from " + file);
                return firebase;
            }
        } catch (error) {
            // Try next Firebase path.
        }
    }

    try {
        const admin = require("firebase-admin");

        if (admin.apps.length > 0) {
            console.log("[ModMail] Firestore loaded from firebase-admin");
            return admin.firestore();
        }
    } catch (error) {
        console.error("[ModMail] Firebase Admin could not be loaded:", error);
    }

    return null;
}


/* =========================================================
   MAIN MODMAIL SETUP
   ========================================================= */

module.exports = function setupModMail(client) {

    if (!client) {
        console.error("[ModMail] Client was not provided.");
        return;
    }

    /*
     * IMPORTANT:
     * Your index.js calls this BEFORE client.login().
     *
     * Therefore we can safely add the DM intent and partial
     * here without modifying index.js.
     */

    try {
        if (client.options && client.options.intents) {
            client.options.intents.add(
                GatewayIntentBits.DirectMessages
            );

            client.options.intents.add(
                GatewayIntentBits.MessageContent
            );
        }

        if (client.options) {
            if (!Array.isArray(client.options.partials)) {
                client.options.partials = [];
            }

            if (!client.options.partials.includes(Partials.Channel)) {
                client.options.partials.push(Partials.Channel);
            }
        }

        console.log("[ModMail] DM intents and partials configured.");
    } catch (error) {
        console.error(
            "[ModMail] Failed to configure DM intents:",
            error
        );
    }


    /* =====================================================
       PREVENT DOUBLE INITIALIZATION
       ===================================================== */

    if (client.__pixelVillaModMailLoaded) {
        console.log("[ModMail] Already loaded.");
        return;
    }

    client.__pixelVillaModMailLoaded = true;


    /* =====================================================
       DATABASE
       ===================================================== */

    const db = loadFirestore();

    if (!db) {
        console.error(
            "[ModMail] ❌ Firestore could not be initialized."
        );
        return;
    }


    /* =====================================================
       LOCKS
       ===================================================== */

    const ticketCreationLocks = new Set();
    const closingLocks = new Set();


    /* =====================================================
       HELPERS
       ===================================================== */

    async function getGuild() {
        return await client.guilds
            .fetch(MODMAIL_CONFIG.guildId)
            .catch(() => null);
    }


    async function getOpenTicket(userId) {
        try {
            const snapshot = await db
                .collection("modmail_tickets")
                .where("userId", "==", userId)
                .where("status", "==", "open")
                .limit(1)
                .get();

            if (snapshot.empty) {
                return null;
            }

            return snapshot.docs[0];
        } catch (error) {
            console.error(
                "[ModMail] Failed to find open ticket:",
                error
            );

            return null;
        }
    }


    async function sendLog(guild, title, color, fields = []) {
        try {
            const channel = await guild.channels
                .fetch(MODMAIL_CONFIG.logsChannelId)
                .catch(() => null);

            if (!channel) {
                console.error(
                    "[ModMail] Logs channel not found."
                );
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(color || "#5865F2")
                .setTitle(title)
                .addFields(fields)
                .setTimestamp();

            await channel.send({
                embeds: [embed]
            });

        } catch (error) {
            console.error(
                "[ModMail] Failed to send log:",
                error
            );
        }
    }


    function getAttachmentURLs(message) {
        return [...message.attachments.values()].map(
            attachment => attachment.url
        );
    }


    function getMessageText(message) {
        if (message.content && message.content.trim()) {
            return message.content;
        }

        if (message.attachments.size > 0) {
            return "*[Attachment(s)]*";
        }

        return "*[No message content]*";
    }


    /* =====================================================
       START NEW TICKET FLOW
       ===================================================== */

    async function startNewTicketFlow(message) {

        const userId = message.author.id;

        const pendingRef = db
            .collection("modmail_pending")
            .doc(userId);

        try {

            const existingPending = await pendingRef.get();

            const entry = {
                content: message.content || "",
                files: getAttachmentURLs(message),
                timestamp: new Date().toISOString()
            };


            if (existingPending.exists) {

                const data = existingPending.data();

                const messages = Array.isArray(data.messages)
                    ? data.messages
                    : [];

                messages.push(entry);

                await pendingRef.set(
                    {
                        messages
                    },
                    {
                        merge: true
                    }
                );

            } else {

                await pendingRef.set({
                    messages: [entry]
                });

            }


            /*
             * Only send category menu when there isn't
             * already a pending flow.
             */

            if (existingPending.exists) {
                return;
            }


            const embed = new EmbedBuilder()
                .setColor("#2B2D31")
                .setTitle("📨 Pixel Villa Support")
                .setDescription(
                    "Welcome to **Pixel Villa Support**.\n\n" +
                    "Please select the category that best matches your query."
                )
                .setFooter({
                    text: "Pixel Villa Support"
                })
                .setTimestamp();


            const row = new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId("modmail_minecraft")
                        .setLabel("Minecraft")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("⛏️"),

                    new ButtonBuilder()
                        .setCustomId("modmail_discord")
                        .setLabel("Discord")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("💬"),

                    new ButtonBuilder()
                        .setCustomId("modmail_others")
                        .setLabel("Others")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("📩")
                );


            await message.author.send({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {

            console.error(
                "[ModMail] Failed to start ticket flow:",
                error
            );

        }
    }


    /* =====================================================
       CREATE TICKET
       ===================================================== */

    async function createTicket(user, categoryKey) {

        if (!db || !client) {
            return;
        }


        const userId = user.id;


        const guild = await client.guilds
            .fetch(MODMAIL_CONFIG.guildId)
            .catch(() => null);


        if (!guild) {

            await user.send(
                "❌ I could not access the support server. Please try again later."
            ).catch(() => {});

            return;
        }


        const ticketsRef = db.collection("modmail_tickets");


        /*
         * Final duplicate check.
         */

        const existing = await ticketsRef
            .where("userId", "==", userId)
            .where("status", "==", "open")
            .limit(1)
            .get();


        if (!existing.empty) {

            await user.send(
                "⚠️ You already have an active support ticket."
            ).catch(() => {});

            return;
        }


        /* =================================================
           TICKET NUMBER
           ================================================= */

        const counterRef = db
            .collection("modmail")
            .doc("config");

        let ticketNumber;


        try {

            ticketNumber = await db.runTransaction(
                async transaction => {

                    const counterDoc =
                        await transaction.get(counterRef);

                    let current = 0;

                    if (counterDoc.exists) {

                        const data = counterDoc.data();

                        current =
                            Number(data.ticketCounter) || 0;
                    }


                    const next = current + 1;


                    transaction.set(
                        counterRef,
                        {
                            ticketCounter: next
                        },
                        {
                            merge: true
                        }
                    );


                    return next;
                }
            );

        } catch (error) {

            console.error(
                "[ModMail] Ticket counter failed:",
                error
            );

            await user.send(
                "❌ Failed to create your support ticket. Please try again later."
            ).catch(() => {});

            return;
        }


        const paddedNumber =
            String(ticketNumber).padStart(4, "0");


        const channelName =
            `${categoryKey}-${paddedNumber}`;


        const supportRoleId =
            MODMAIL_CONFIG.supportRoles[categoryKey];


        if (!supportRoleId) {

            console.error(
                "[ModMail] Invalid support role for:",
                categoryKey
            );

            return;
        }


        /* =================================================
           PERMISSIONS
           ================================================= */

        const permissionOverwrites = [

            {
                id: guild.id,

                deny: [
                    PermissionFlagsBits.ViewChannel
                ]
            },

            {
                id: client.user.id,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                ]
            },

            {
                id: supportRoleId,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                ]
            }
        ];


        /* =================================================
           CREATE CHANNEL
           ================================================= */

        let ticketChannel;


        try {

            ticketChannel = await guild.channels.create({

                name: channelName,

                type: ChannelType.GuildText,

                parent: MODMAIL_CONFIG.ticketCategoryId,

                permissionOverwrites

            });

        } catch (error) {

            console.error(
                "[ModMail] Failed to create ticket channel:",
                error
            );

            await user.send(
                "❌ Failed to create your support ticket. Please try again later."
            ).catch(() => {});

            return;
        }


        /* =================================================
           FIRESTORE TICKET
           ================================================= */

        const ticketDoc =
            ticketsRef.doc();


        try {

            await ticketDoc.set({

                ticketId: ticketNumber,

                channelId: ticketChannel.id,

                userId,

                category: categoryKey,

                status: "open",

                createdAt:
                    new Date().toISOString(),

                closedAt: null,

                closedBy: null,

                claimedBy: null

            });

        } catch (error) {

            console.error(
                "[ModMail] Failed to save ticket:",
                error
            );

            await ticketChannel.delete()
                .catch(() => {});

            await user.send(
                "❌ Failed to save your support ticket. Please try again later."
            ).catch(() => {});

            return;
        }


        /* =================================================
           TICKET EMBED
           ================================================= */

        const ticketEmbed = new EmbedBuilder()

            .setColor("#5865F2")

            .setTitle("📨 Pixel Villa Support")

            .setDescription(
                "A new support ticket has been created."
            )

            .addFields(

                {
                    name: "👤 User",
                    value: `<@${userId}>`,
                    inline: true
                },

                {
                    name: "🆔 User ID",
                    value: userId,
                    inline: true
                },

                {
                    name: "📂 Category",
                    value: CATEGORY_NAMES[categoryKey],
                    inline: true
                },

                {
                    name: "🎫 Ticket",
                    value: `#${paddedNumber}`,
                    inline: true
                },

                {
                    name: "📊 Status",
                    value: "🟢 Open",
                    inline: true
                }
            )

            .setTimestamp();


        await ticketChannel.send({
            embeds: [ticketEmbed]
        }).catch(() => {});


        /* =================================================
           SEND PENDING MESSAGES
           ================================================= */

        const pendingRef = db
            .collection("modmail_pending")
            .doc(userId);


        try {

            const pendingDoc =
                await pendingRef.get();


            if (pendingDoc.exists) {

                const data =
                    pendingDoc.data();

                const messages =
                    Array.isArray(data.messages)
                        ? data.messages
                        : [];


                for (const msg of messages) {

                    let content =
                        msg.content || "";


                    if (
                        !content &&
                        Array.isArray(msg.files) &&
                        msg.files.length
                    ) {

                        content =
                            "*[Attachment(s)]*";
                    }


                    await ticketChannel.send({

                        content:
                            `👤 **${user.tag}**\n${content || "*[No content]*"}`,

                        files:
                            Array.isArray(msg.files)
                                ? msg.files
                                : []

                    }).catch(() => {});
                }


                await pendingRef.delete()
                    .catch(() => {});
            }

        } catch (error) {

            console.error(
                "[ModMail] Failed to process pending messages:",
                error
            );
        }


        /* =================================================
           LOG
           ================================================= */

        await sendLog(

            guild,

            "🎫 Ticket Created",

            "#57F287",

            [

                {
                    name: "Ticket",
                    value: `#${paddedNumber}`,
                    inline: true
                },

                {
                    name: "Category",
                    value: CATEGORY_NAMES[categoryKey],
                    inline: true
                },

                {
                    name: "User",
                    value: `<@${userId}> (${userId})`,
                    inline: false
                },

                {
                    name: "Channel",
                    value: `<#${ticketChannel.id}>`,
                    inline: true
                }
            ]
        );
        /* =================================================
           CONFIRMATION DM
           ================================================= */

        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor("#57F287")
                    .setTitle("✅ Support Ticket Created")
                    .setDescription(
                        `Your support ticket has been successfully created.\n\n` +
                        `🎫 **Ticket:** #${paddedNum}\n` +
                        `📂 **Category:** ${CATEGORY_NAMES[categoryKey]}\n\n` +
                        `Staff will respond to you shortly.`
                    )
                    .setFooter({
                        text: "Pixel Villa Support"
                    })
                    .setTimestamp()
            ]
        }).catch(() => {});

    }

    /**
     * Close a ticket.
     */
    async closeTicket(message, ticketDoc, ticketData) {
        const ticketIdKey = ticketDoc.id;

        if (this.closingLocks.has(ticketIdKey)) return;

        this.closingLocks.add(ticketIdKey);

        try {
            const freshDoc = await ticketDoc.ref.get();

            if (!freshDoc.exists) return;

            const freshData = freshDoc.data();

            if (freshData.status !== "open") {
                return;
            }

            const guild = message.guild;

            const member = await guild.members
                .fetch(message.author.id)
                .catch(() => null);

            const requiredRole =
                MODMAIL_CONFIG.supportRoles[ticketData.category];

            if (
                !member ||
                !requiredRole ||
                !member.roles.cache.has(requiredRole)
            ) {
                await message
                    .reply(
                        "❌ You do not have permission to close this ticket."
                    )
                    .catch(() => {});

                return;
            }

            const closedAt = new Date().toISOString();

            await ticketDoc.ref.update({
                status: "closed",
                closedAt,
                closedBy: message.author.id
            });

            /* =================================================
               USER CLOSE DM
               ================================================= */

            const user = await this.client.users
                .fetch(ticketData.userId)
                .catch(() => null);

            if (user) {
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#ED4245")
                            .setTitle("🔒 Support Ticket Closed")
                            .setDescription(
                                `Your support ticket **#${String(
                                    ticketData.ticketId
                                ).padStart(4, "0")}** has been closed.\n\n` +
                                `If you need help again, simply send me a new DM.`
                            )
                            .setFooter({
                                text: "Pixel Villa Support"
                            })
                            .setTimestamp()
                    ]
                }).catch(() => {});
            }

            /* =================================================
               CLOSE LOG
               ================================================= */

            await this.sendLog(guild, {
                title: "🔒 Ticket Closed",
                color: "#ED4245",
                fields: [
                    {
                        name: "Ticket",
                        value: `#${String(ticketData.ticketId).padStart(
                            4,
                            "0"
                        )}`,
                        inline: true
                    },
                    {
                        name: "Category",
                        value:
                            CATEGORY_NAMES[ticketData.category] ||
                            ticketData.category,
                        inline: true
                    },
                    {
                        name: "User",
                        value: `<@${ticketData.userId}>`,
                        inline: true
                    },
                    {
                        name: "Closed By",
                        value: `<@${message.author.id}>`,
                        inline: true
                    }
                ]
            });

            /* =================================================
               DELETE CHANNEL
               ================================================= */

            await message
                .channel
                .send("🔒 Ticket closed. Deleting this channel in 3 seconds...")
                .catch(() => {});

            setTimeout(async () => {
                await message.channel.delete().catch(() => {});
            }, 3000);

        } catch (error) {
            console.error("[ModMail] Error closing ticket:", error);
        } finally {
            this.closingLocks.delete(ticketIdKey);
        }
    }

    /**
     * Handle manually deleted ticket channels.
     */
    async handleChannelDelete(channel) {
        if (!this.db) return;

        if (channel.type !== ChannelType.GuildText) return;

        try {
            const ticketsRef =
                this.db.collection("modmail_tickets");

            const snapshot = await ticketsRef
                .where("channelId", "==", channel.id)
                .where("status", "==", "open")
                .get();

            if (snapshot.empty) return;

            for (const doc of snapshot.docs) {
                await doc.ref.update({
                    status: "closed",
                    closedAt: new Date().toISOString(),
                    closedBy: "manual_channel_delete"
                }).catch(() => {});
            }

        } catch (error) {
            console.error(
                "[ModMail] Error handling deleted channel:",
                error
            );
        }
    }

    /**
     * Send ModMail logs.
     */
    async sendLog(guild, embedData) {
        try {
            const logsChannel = await guild.channels
                .fetch(MODMAIL_CONFIG.logsChannelId)
                .catch(() => null);

            if (!logsChannel) {
                console.error(
                    "[ModMail] Logs channel not found:",
                    MODMAIL_CONFIG.logsChannelId
                );
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(embedData.color || "#5865F2")
                .setTitle(embedData.title || "ModMail Log")
                .setTimestamp();

            if (embedData.description) {
                embed.setDescription(embedData.description);
            }

            if (
                Array.isArray(embedData.fields) &&
                embedData.fields.length > 0
            ) {
                embed.addFields(embedData.fields);
            }

            await logsChannel.send({
                embeds: [embed]
            });

        } catch (error) {
            console.error("[ModMail] Logging failed:", error);
        }
    }
}

/* =========================================================
   MODMAIL INSTANCE
   ========================================================= */

const modmail = new ModMailSystem();

/* =========================================================
   IMPORTANT:
   index.js uses:

   require("./help")(client);

   Therefore help.js MUST export a FUNCTION.
   ========================================================= */

module.exports = function (client) {
    if (!client) {
        console.error(
            "[ModMail] Client was not provided."
        );
        return;
    }

    modmail.attach(client);
};

        
