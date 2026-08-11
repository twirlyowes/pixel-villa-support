"use strict";

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    Client
} = require("discord.js");

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

class ModMailSystem {
    constructor() {
        this.client = null;
        this.db = null;

        this.attached = false;
        this.listenersRegistered = false;
        this.databaseLoaded = false;

        this.ticketCreationLocks = new Set();
        this.closingLocks = new Set();

        this.hookClient();
    }

    /**
     * Automatically finds the existing Discord client.
     * No changes to index.js are required.
     */
    hookClient() {
        // First try to find an already-created client in require.cache.
        try {
            for (const cachedPath of Object.keys(require.cache)) {
                try {
                    const mod = require.cache[cachedPath];

                    if (!mod || !mod.exports) continue;

                    // Direct client export
                    if (
                        mod.exports instanceof Client ||
                        (
                            mod.exports.user &&
                            typeof mod.exports.login === "function" &&
                            typeof mod.exports.on === "function"
                        )
                    ) {
                        this.attach(mod.exports);
                        return;
                    }

                    // { client } export
                    if (
                        mod.exports.client &&
                        typeof mod.exports.client.login === "function" &&
                        typeof mod.exports.client.on === "function"
                    ) {
                        this.attach(mod.exports.client);
                        return;
                    }
                } catch {
                    // Ignore individual cache inspection errors.
                }
            }
        } catch (error) {
            console.error("[ModMail] Client cache inspection error:", error);
        }

        /*
         * If the client has not been created yet, hook Client.prototype.login.
         *
         * Store the ModMail instance on the prototype so that a module reload
         * can replace the previous ModMail instance safely.
         */
        if (!Client.prototype.__pixelVillaModMailHook) {
            const originalLogin = Client.prototype.login;

            const hookData = {
                originalLogin,
                instance: this
            };

            Client.prototype.__pixelVillaModMailHook = hookData;

            Client.prototype.login = function (...args) {
                const currentHook =
                    Client.prototype.__pixelVillaModMailHook;

                if (currentHook && currentHook.instance) {
                    currentHook.instance.attach(this);
                }

                return currentHook.originalLogin.apply(this, args);
            };
        } else {
            Client.prototype.__pixelVillaModMailHook.instance = this;
        }
    }

    /**
     * Attach ModMail to the existing Discord client.
     */
    async attach(client) {
        if (!client) return;

        if (this.attached && this.client === client) {
            return;
        }

        this.attached = true;
        this.client = client;

        await this.loadDatabase();

        this.registerListeners();

        console.log(
            "[ModMail] Pixel Villa Support ModMail system initialized successfully."
        );
    }

    /**
     * Load the existing Firebase/Firestore instance.
     */
    async loadDatabase() {
        if (this.databaseLoaded && this.db) return this.db;

        this.databaseLoaded = true;

        const firebaseModules = [
            "./firebase",
            "./firebase.js",
            "../firebase",
            "./utils/firebase"
        ];

        for (const modulePath of firebaseModules) {
            try {
                const fb = require(modulePath);

                if (!fb) continue;

                /*
                 * Support:
                 * - firebase-admin export
                 * - { db }
                 * - { firestore() }
                 * - direct Firestore instance
                 */
                if (typeof fb.firestore === "function") {
                    this.db = fb.firestore();
                } else if (fb.db) {
                    this.db = fb.db;
                } else if (typeof fb.collection === "function") {
                    this.db = fb;
                }

                if (this.db) {
                    console.log(
                        `[ModMail] Firestore loaded from ${modulePath}`
                    );
                    return this.db;
                }
            } catch {
                // Try the next Firebase path.
            }
        }

        // Firebase Admin fallback.
        try {
            const admin = require("firebase-admin");

            if (admin.apps.length > 0) {
                this.db = admin.firestore();

                console.log(
                    "[ModMail] Firestore loaded from firebase-admin."
                );

                return this.db;
            }
        } catch (error) {
            console.error(
                "[ModMail] Firebase Admin fallback failed:",
                error
            );
        }

        this.db = null;

        console.error(
            "[ModMail] Firestore could not be loaded. ModMail database features are unavailable."
        );

        return null;
    }

    /**
     * Register Discord event listeners exactly once.
     */
    registerListeners() {
        if (!this.client || this.listenersRegistered) return;

        this.listenersRegistered = true;

        this.client.on("messageCreate", async (message) => {
            try {
                await this.handleMessage(message);
            } catch (error) {
                console.error(
                    "[ModMail] messageCreate error:",
                    error
                );
            }
        });

        this.client.on("interactionCreate", async (interaction) => {
            try {
                if (interaction.isButton()) {
                    await this.handleButton(interaction);
                }
            } catch (error) {
                console.error(
                    "[ModMail] interactionCreate error:",
                    error
                );
            }
        });

        this.client.on("channelDelete", async (channel) => {
            try {
                await this.handleChannelDelete(channel);
            } catch (error) {
                console.error(
                    "[ModMail] channelDelete error:",
                    error
                );
            }
        });
    }

    /**
     * Safely get attachment URLs from a Discord Collection.
     */
    getAttachmentUrls(message) {
        return [...message.attachments.values()]
            .map((attachment) => attachment.url)
            .filter(Boolean);
    }

    /**
     * Handle all incoming messages.
     */
    async handleMessage(message) {
        if (!message || message.author?.bot) return;
        if (!this.db || !this.client) return;

        // =========================
        // USER -> BOT DM
        // =========================
        if (message.channel.type === ChannelType.DM) {
            return await this.handleUserDM(message);
        }

        // =========================
        // STAFF -> USER
        // =========================
        if (
            message.guild &&
            message.guild.id === MODMAIL_CONFIG.guildId
        ) {
            return await this.handleStaffMessage(message);
        }
    }

    /**
     * Handle user DMs.
     */
    async handleUserDM(message) {
        const userId = message.author.id;

        const ticketsRef =
            this.db.collection("modmail_tickets");

        let snapshot;

        try {
            snapshot = await ticketsRef
                .where("userId", "==", userId)
                .where("status", "==", "open")
                .limit(1)
                .get();
        } catch (error) {
            console.error(
                "[ModMail] Failed to check existing ticket:",
                error
            );

            await message.author
                .send(
                    "❌ Support is temporarily unavailable. Please try again later."
                )
                .catch(() => {});

            return;
        }

        // Existing ticket
        if (!snapshot.empty) {
            const ticketDoc = snapshot.docs[0];
            const ticketData = ticketDoc.data();

            const guild = await this.client.guilds
                .fetch(MODMAIL_CONFIG.guildId)
                .catch(() => null);

            if (!guild) return;

            const channel = await guild.channels
                .fetch(ticketData.channelId)
                .catch(() => null);

            // Ticket channel no longer exists.
            if (!channel) {
                await ticketDoc.ref
                    .update({
                        status: "closed",
                        closedAt: new Date().toISOString(),
                        closedBy: "system"
                    })
                    .catch(() => {});

                return await this.startNewTicketFlow(message);
            }

            const files = this.getAttachmentUrls(message);

            let content = message.content || "";

            if (!content && files.length > 0) {
                content = "*[Attachment(s)]*";
            }

            const forwardedContent =
                `👤 **${message.author.tag}**\n${content}`;

            try {
                await channel.send({
                    content: forwardedContent,
                    files
                });

                await message.react("✅").catch(() => {});
            } catch (error) {
                console.error(
                    "[ModMail] Failed to forward user DM:",
                    error
                );
            }

            return;
        }

        // No active ticket.
        return await this.startNewTicketFlow(message);
    }

    /**
     * Handle staff messages inside ticket channels.
     */
    async handleStaffMessage(message) {
        const ticketsRef =
            this.db.collection("modmail_tickets");

        let snapshot;

        try {
            snapshot = await ticketsRef
                .where("channelId", "==", message.channel.id)
                .where("status", "==", "open")
                .limit(1)
                .get();
        } catch (error) {
            console.error(
                "[ModMail] Failed to find ticket:",
                error
            );
            return;
        }

        if (snapshot.empty) return;

        const ticketDoc = snapshot.docs[0];
        const ticketData = ticketDoc.data();

        // .close
        if (
            message.content &&
            message.content.trim().toLowerCase() === ".close"
        ) {
            return await this.closeTicket(
                message,
                ticketDoc,
                ticketData
            );
        }

        const member = await message.guild.members
            .fetch(message.author.id)
            .catch(() => null);

        if (!member) return;

        const requiredRole =
            MODMAIL_CONFIG.supportRoles[ticketData.category];

        if (
            !requiredRole ||
            !member.roles.cache.has(requiredRole)
        ) {
            return;
        }

        const targetUser = await this.client.users
            .fetch(ticketData.userId)
            .catch(() => null);

        if (!targetUser) {
            await message.channel
                .send(
                    "⚠️ Failed to deliver message to user's DMs."
                )
                .catch(() => {});

            return;
        }

        const files = this.getAttachmentUrls(message);

        let description = message.content || "";

        if (!description && files.length > 0) {
            description = "*[Attachment(s)]*";
        }

        /*
         * Discord embeds have a 4096 character description limit.
         */
        if (description.length > 4096) {
            description =
                description.substring(0, 4090) + "…";
        }

        const embed = new EmbedBuilder()
            .setColor("#5865F2")
            .setTitle("💬 Pixel Villa Support")
            .setDescription(description)
            .setTimestamp();

        try {
            await targetUser.send({
                embeds: [embed],
                files
            });

            await message.react("✅").catch(() => {});
        } catch (error) {
            console.error(
                "[ModMail] Failed to deliver staff message:",
                error
            );

            await message.channel
                .send(
                    "⚠️ Failed to deliver message to user's DMs."
                )
                .catch(() => {});
        }
    }

    /**
     * Store pending user messages and show category selection.
     */
    async startNewTicketFlow(message) {
        if (!this.db) return;

        const userId = message.author.id;

        const pendingRef =
            this.db.collection("modmail_pending").doc(userId);

        const files = this.getAttachmentUrls(message);

        const pendingMessage = {
            content: message.content || "",
            files,
            timestamp: new Date().toISOString()
        };

        try {
            const pendingDoc = await pendingRef.get();

            if (pendingDoc.exists) {
                const data = pendingDoc.data() || {};

                const messages = Array.isArray(data.messages)
                    ? data.messages
                    : [];

                messages.push(pendingMessage);

                await pendingRef.set(
                    {
                        messages,
                        updatedAt: new Date().toISOString()
                    },
                    { merge: true }
                );

                /*
                 * Do not send another category menu.
                 */
                return;
            }

            await pendingRef.set({
                messages: [pendingMessage],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error(
                "[ModMail] Failed to save pending message:",
                error
            );

            return;
        }

        const embed = new EmbedBuilder()
            .setColor("#2B2D31")
            .setTitle("📨 Pixel Villa Support")
            .setDescription(
                "«Welcome to Pixel Villa Support.\nPlease select the category that best matches your query.»"
            );

        const row = new ActionRowBuilder().addComponents(
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

        await message.author
            .send({
                embeds: [embed],
                components: [row]
            })
            .catch(() => {});
    }

    /**
     * Handle category buttons.
     */
    async handleButton(interaction) {
        if (!interaction.customId.startsWith("modmail_")) {
            return;
        }

        if (!this.db) {
            await interaction
                .reply({
                    content:
                        "❌ Support is temporarily unavailable. Please try again later.",
                    ephemeral: true
                })
                .catch(() => {});

            return;
        }

        const categoryKey =
            interaction.customId.replace("modmail_", "");

        if (!VALID_CATEGORIES.includes(categoryKey)) {
            await interaction
                .reply({
                    content: "❌ Invalid category selection.",
                    ephemeral: true
                })
                .catch(() => {});

            return;
        }

        const userId = interaction.user.id;

        if (this.ticketCreationLocks.has(userId)) {
            await interaction
                .reply({
                    content:
                        "⏳ Your ticket is already being created, please wait...",
                    ephemeral: true
                })
                .catch(() => {});

            return;
        }

        this.ticketCreationLocks.add(userId);

        try {
            const ticketsRef =
                this.db.collection("modmail_tickets");

            const existing = await ticketsRef
                .where("userId", "==", userId)
                .where("status", "==", "open")
                .limit(1)
                .get();

            if (!existing.empty) {
                await interaction
                    .update({
                        content:
                            "⚠️ You already have an active support ticket open.",
                        embeds: [],
                        components: []
                    })
                    .catch(() => {});

                return;
            }

            /*
             * Acknowledge the button before doing Firestore/Discord work.
             */
            await interaction
                .update({
                    content:
                        `✅ Category selected: **${CATEGORY_NAMES[categoryKey]}**. Creating your ticket...`,
                    embeds: [],
                    components: []
                })
                .catch(() => {});

            await this.createTicket(
                interaction.user,
                categoryKey
            );
        } catch (error) {
            console.error(
                "[ModMail] Button handling error:",
                error
            );

            if (!interaction.replied && !interaction.deferred) {
                await interaction
                    .reply({
                        content:
                            "❌ Something went wrong while creating your ticket.",
                        ephemeral: true
                    })
                    .catch(() => {});
            }
        } finally {
            this.ticketCreationLocks.delete(userId);
        }
    }

        /**
     * Create a ticket channel and Firestore ticket.
     */
    async createTicket(user, categoryKey) {
        if (!this.db || !this.client) return;

        const userId = user.id;

        const guild = await this.client.guilds
            .fetch(MODMAIL_CONFIG.guildId)
            .catch(() => null);

        if (!guild) {
            await user
                .send(
                    "❌ I could not access the support server. Please try again later."
                )
                .catch(() => {});

            return;
        }

        // Validate category
        if (!Object.prototype.hasOwnProperty.call(
            MODMAIL_CONFIG.supportRoles,
            categoryKey
        )) {
            await user
                .send("❌ Invalid support category.")
                .catch(() => {});

            return;
        }

        const ticketsRef = this.db.collection("modmail_tickets");

        // Final protection against duplicate active tickets
        const existing = await ticketsRef
            .where("userId", "==", userId)
            .where("status", "==", "open")
            .get();

        if (!existing.empty) {
            await user
                .send("⚠️ You already have an active support ticket.")
                .catch(() => {});

            return;
        }

        /*
         * Generate ticket number atomically.
         * This prevents two users from receiving the same number.
         */
        const counterRef = this.db
            .collection("modmail")
            .doc("config");

        let ticketNumber;

        try {
            ticketNumber = await this.db.runTransaction(
                async (transaction) => {
                    const counterDoc = await transaction.get(counterRef);

                    let currentNumber = 0;

                    if (counterDoc.exists) {
                        currentNumber =
                            Number(counterDoc.data().ticketCounter) || 0;
                    }

                    const nextNumber = currentNumber + 1;

                    transaction.set(
                        counterRef,
                        {
                            ticketCounter: nextNumber,
                            updatedAt: new Date().toISOString()
                        },
                        { merge: true }
                    );

                    return nextNumber;
                }
            );
        } catch (error) {
            console.error(
                "[ModMail] Failed to generate ticket number:",
                error
            );

            await user
                .send(
                    "❌ Failed to generate your ticket number. Please try again later."
                )
                .catch(() => {});

            return;
        }

        const paddedNumber = String(ticketNumber).padStart(4, "0");
        const channelName = `${categoryKey}-${paddedNumber}`;

        const supportRoleId =
            MODMAIL_CONFIG.supportRoles[categoryKey];

        /*
         * Ticket channel permissions:
         *
         * @everyone -> cannot see
         * Bot        -> full ticket access
         * Support    -> access according to category
         */
        const permissionOverwrites = [
            {
                id: guild.id,
                deny: [
                    PermissionFlagsBits.ViewChannel
                ]
            },
            {
                id: this.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages
                ]
            },
            {
                id: supportRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            }
        ];

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

            await user
                .send(
                    "❌ Failed to create your support ticket. Please try again later."
                )
                .catch(() => {});

            return;
        }

        /*
         * Create Firestore ticket document.
         */
        let ticketDoc;

        try {
            ticketDoc = ticketsRef.doc();

            await ticketDoc.set({
                ticketId: ticketNumber,
                ticketNumber: paddedNumber,
                channelId: ticketChannel.id,
                guildId: guild.id,
                userId,
                category: categoryKey,
                status: "open",

                createdAt: new Date().toISOString(),

                closedAt: null,
                closedBy: null,

                claimedBy: null,
                claimedAt: null
            });
        } catch (error) {
            console.error(
                "[ModMail] Failed to save ticket to Firestore:",
                error
            );

            // Firestore failed, so remove the orphan channel.
            await ticketChannel
                .delete()
                .catch(() => {});

            await user
                .send(
                    "❌ Failed to save your support ticket. Please try again later."
                )
                .catch(() => {});

            return;
        }

        /*
         * Ticket opening embed.
         */
        const ticketEmbed = new EmbedBuilder()
            .setColor("#00AE86")
            .setTitle("📨 Pixel Villa Support")
            .setDescription(
                "A new support ticket has been opened."
            )
            .addFields(
                {
                    name: "User",
                    value: `<@${userId}>`,
                    inline: true
                },
                {
                    name: "User ID",
                    value: userId,
                    inline: true
                },
                {
                    name: "Category",
                    value:
                        CATEGORY_NAMES[categoryKey] ||
                        categoryKey,
                    inline: true
                },
                {
                    name: "Ticket",
                    value: `#${paddedNumber}`,
                    inline: true
                },
                {
                    name: "Status",
                    value: "🟢 Open",
                    inline: true
                }
            )
            .setFooter({
                text: "Pixel Villa Support"
            })
            .setTimestamp();

        try {
            await ticketChannel.send({
                content: `<@&${supportRoleId}>`,
                embeds: [ticketEmbed]
            });
        } catch (error) {
            console.error(
                "[ModMail] Failed to send ticket embed:",
                error
            );
        }

        /*
         * Forward messages that the user sent before
         * selecting the category.
         */
        try {
            const pendingRef = this.db
                .collection("modmail_pending")
                .doc(userId);

            const pendingDoc = await pendingRef.get();

            if (pendingDoc.exists) {
                const pendingData = pendingDoc.data();

                const messages = Array.isArray(
                    pendingData.messages
                )
                    ? pendingData.messages
                    : [];

                for (const pendingMessage of messages) {
                    const files = Array.isArray(
                        pendingMessage.files
                    )
                        ? pendingMessage.files
                        : [];

                    let content =
                        pendingMessage.content || "";

                    if (!content && files.length > 0) {
                        content = "*[Attachment(s)]*";
                    }

                    if (!content && files.length === 0) {
                        continue;
                    }

                    await ticketChannel
                        .send({
                            content:
                                `👤 **${user.tag}**\n${content}`,
                            files
                        })
                        .catch((error) => {
                            console.error(
                                "[ModMail] Failed to forward pending message:",
                                error
                            );
                        });
                }

                await pendingRef.delete().catch(() => {});
            }
        } catch (error) {
            console.error(
                "[ModMail] Failed to process pending messages:",
                error
            );
        }

        /*
         * Log ticket creation.
         */
        await this.sendLog(guild, {
            title: "🎫 Ticket Created",
            color: "#00FF00",
            fields: [
                {
                    name: "Ticket Number",
                    value: `#${paddedNumber}`,
                    inline: true
                },
                {
                    name: "Category",
                    value:
                        CATEGORY_NAMES[categoryKey] ||
                        categoryKey,
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
        });

        /*
         * Tell the user their ticket is ready.
         */
        await user
            .send(
                `✅ Your support ticket **#${paddedNumber}** has been created!\n\n` +
                `📂 Category: **${CATEGORY_NAMES[categoryKey] || categoryKey}**\n` +
                `Staff will respond to you shortly.`
            )
            .catch(() => {});

        console.log(
            `[ModMail] Ticket #${paddedNumber} created for ${user.tag} (${userId})`
        );
    }

    /**
     * Close an active ticket.
     */
    async closeTicket(message, ticketDoc, ticketData) {
        if (!this.db || !this.client) return;

        const ticketDocumentId = ticketDoc.id;

        // Prevent multiple .close commands at the same time.
        if (this.closingLocks.has(ticketDocumentId)) {
            return;
        }

        this.closingLocks.add(ticketDocumentId);

        try {
            // Re-read the ticket to make sure it is still open.
            const freshDoc = await ticketDoc.ref.get();

            if (!freshDoc.exists) {
                return;
            }

            const freshData = freshDoc.data();

            if (freshData.status !== "open") {
                return;
            }

            const guild = message.guild;

            if (!guild) {
                return;
            }

            const member = await guild.members
                .fetch(message.author.id)
                .catch(() => null);

            const requiredRole =
                MODMAIL_CONFIG.supportRoles[
                    freshData.category
                ];

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

            /*
             * Mark the ticket closed BEFORE deleting the channel.
             * This prevents channelDelete from treating it as
             * a manually deleted active ticket.
             */
            await ticketDoc.ref.update({
                status: "closed",
                closedAt: new Date().toISOString(),
                closedBy: message.author.id
            });

            /*
             * Notify the user.
             */
            const user = await this.client.users
                .fetch(freshData.userId)
                .catch(() => null);

            if (user) {
                const closeEmbed = new EmbedBuilder()
                    .setColor("#ED4245")
                    .setTitle("🔒 Pixel Villa Support")
                    .setDescription(
                        "Your support ticket has been closed.\n\n" +
                        "If you need help again, simply send a new DM to Pixel Villa Support."
                    )
                    .addFields({
                        name: "Ticket",
                        value:
                            `#${String(
                                freshData.ticketId
                            ).padStart(4, "0")}`,
                        inline: true
                    })
                    .setTimestamp();

                await user
                    .send({
                        embeds: [closeEmbed]
                    })
                    .catch(() => {});
            }

            /*
             * Log closure.
             */
            await this.sendLog(guild, {
                title: "🔒 Ticket Closed",
                color: "#ED4245",
                fields: [
                    {
                        name: "Ticket Number",
                        value:
                            `#${String(
                                freshData.ticketId
                            ).padStart(4, "0")}`,
                        inline: true
                    },
                    {
                        name: "Category",
                        value:
                            CATEGORY_NAMES[
                                freshData.category
                            ] ||
                            freshData.category,
                        inline: true
                    },
                    {
                        name: "User ID",
                        value: freshData.userId,
                        inline: true
                    },
                    {
                        name: "Closed By",
                        value: `<@${message.author.id}>`,
                        inline: true
                    }
                ]
            });

            await message.channel
                .send(
                    "🔒 Ticket closed. This channel will be deleted in 3 seconds."
                )
                .catch(() => {});

            setTimeout(async () => {
                try {
                    if (message.channel) {
                        await message.channel.delete(
                            "ModMail ticket closed"
                        );
                    }
                } catch (error) {
                    console.error(
                        "[ModMail] Failed to delete closed ticket channel:",
                        error
                    );
                }
            }, 3000);
        } catch (error) {
            console.error(
                "[ModMail] Error while closing ticket:",
                error
            );
        } finally {
            // Keep the lock briefly so duplicate .close commands
            // cannot run while Discord is deleting the channel.
            setTimeout(() => {
                this.closingLocks.delete(ticketDocumentId);
            }, 5000);
        }
    }

    /**
     * Handle manual ticket channel deletion.
     */
    async handleChannelDelete(channel) {
        if (!this.db) return;

        if (
            channel.type !== ChannelType.GuildText ||
            channel.guild?.id !== MODMAIL_CONFIG.guildId
        ) {
            return;
        }

        try {
            const ticketsRef =
                this.db.collection("modmail_tickets");

            const snapshot = await ticketsRef
                .where("channelId", "==", channel.id)
                .where("status", "==", "open")
                .get();

            if (snapshot.empty) {
                return;
            }

            for (const doc of snapshot.docs) {
                await doc.ref
                    .update({
                        status: "closed",
                        closedAt: new Date().toISOString(),
                        closedBy: "manual_channel_delete"
                    })
                    .catch(() => {});
            }

            console.log(
                `[ModMail] Ticket channel ${channel.id} was manually deleted.`
            );
        } catch (error) {
            console.error(
                "[ModMail] Error handling deleted ticket channel:",
                error
            );
        }
    }

    /**
     * Send a ModMail log to the configured log channel.
     */
    async sendLog(guild, embedData) {
        if (!guild) return;

        try {
            const logsChannel = await guild.channels
                .fetch(MODMAIL_CONFIG.logsChannelId)
                .catch(() => null);

            if (!logsChannel) {
                console.error(
                    "[ModMail] Logs channel was not found."
                );
                return;
            }

            if (
                !logsChannel.isTextBased ||
                !logsChannel.isTextBased()
            ) {
                console.error(
                    "[ModMail] Logs channel is not text based."
                );
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(
                    embedData.color || "#5865F2"
                )
                .setTitle(
                    embedData.title || "ModMail Log"
                )
                .setTimestamp();

            if (
                Array.isArray(embedData.fields) &&
                embedData.fields.length > 0
            ) {
                embed.addFields(embedData.fields);
            }

            if (embedData.description) {
                embed.setDescription(
                    embedData.description
                );
            }

            await logsChannel
                .send({
                    embeds: [embed]
                })
                .catch((error) => {
                    console.error(
                        "[ModMail] Failed to send log:",
                        error
                    );
                });
        } catch (error) {
            console.error(
                "[ModMail] Logging failed:",
                error
            );
        }
    }
}

/*
 * Create ONE ModMail instance.
 *
 * `require("./help")` returns this instance, while the
 * constructor automatically hooks the Discord client.
 */
const modmail = new ModMailSystem();

module.exports = modmail;
