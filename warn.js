const { EmbedBuilder } = require("discord.js");
const config = require("./config.json");
const { db } = require("./firebase");

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

module.exports = client => {
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

    client.on("messageCreate", async message => {
        if (message.author.bot || !message.guild) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const warnCommands = ["warn", "wlist", "wremove", "wreset"];

        if (!warnCommands.includes(command)) return;

        if (
            !config.STAFF_ROLE_ID ||
            !message.member.roles.cache.has(config.STAFF_ROLE_ID)
        ) {
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
            if (command === "warn") {
                const user = message.mentions.members.first();
                const reason = args.slice(1).join(" ") || "No reason provided";

                if (!user) {
                    return message.channel.send({
                        embeds: [
                            makeEmbed(
                                "#E74C3C",
                                "<a:error:1532986765105696778> Invalid Usage",
                                `**Usage:** \`${PREFIX}warn @user [reason]\``
                            )
                        ]
                    });
                }

                const userDoc = await db.collection("warnings").doc(user.id).get();

                const userWarnings = userDoc.exists
                    ? userDoc.data().warnings || []
                    : [];

                const warnId = Math.floor(
                    100000 + Math.random() * 900000
                ).toString();

                const now = new Date();

                const newWarning = {
                    id: warnId,
                    moderator: message.author.tag,
                    reason,
                    timestamp: now.toISOString()
                };

                userWarnings.push(newWarning);

                await db.collection("warnings").doc(user.id).set({
                    warnings: userWarnings
                });

                let dmedUser = "Yes";

                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor("#F1C40F")
                        .setAuthor({
                            name: "Pixel Villa Support • Warning System",
                            iconURL: client.user.displayAvatarURL()
                        })
                        .setTitle(
                            `<a:Warning:1532986372716236932> Warning Received | ${message.guild.name}`
                        )
                        .setDescription(
                            `You have received a warning in **${message.guild.name}**.\n\n**Reason:** ${reason}`
                        )
                        .setFooter({
                            text: "Pixel Villa Support • Moderation"
                        })
                        .setTimestamp();

                    await user.send({
                        embeds: [dmEmbed]
                    });
                } catch {
                    dmedUser = "No (DMs Closed)";
                }

                const formattedDate = now.toLocaleString("en-US", {
                    year: "numeric",
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                    second: "numeric",
                    hour12: true
                });

                const warnEmbed = new EmbedBuilder()
                    .setColor("#43B581")
                    .setAuthor({
                        name: "Pixel Villa Support • Warning System",
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setThumbnail(
                        user.user.displayAvatarURL({
                            dynamic: true
                        })
                    )
                    .setTitle(
                        `✅ ${user.user.username} has been warned.`
                    )
                    .addFields(
                        {
                            name: "Reason",
                            value: reason,
                            inline: false
                        },
                        {
                            name: "Warned by",
                            value: `${message.author.username} (${message.author.id})`,
                            inline: true
                        },
                        {
                            name: "Timestamp",
                            value: formattedDate,
                            inline: true
                        },
                        {
                            name: "Warning ID",
                            value: warnId,
                            inline: true
                        },
                        {
                            name: "Member Notified",
                            value: dmedUser,
                            inline: true
                        },
                        {
                            name: "Total Warnings",
                            value: `${userWarnings.length}/5`,
                            inline: true
                        }
                    )
                    .setFooter({
                        text: "Pixel Villa Support • Moderation"
                    })
                    .setTimestamp();

                await message.channel.send({
                    embeds: [warnEmbed]
                });

                if (config.LOG_CHANNEL_ID) {
                    try {
                        const logChannel = await message.guild.channels.fetch(
                            config.LOG_CHANNEL_ID
                        );

                        if (logChannel) {
                            await logChannel.send({
                                embeds: [warnEmbed]
                            });
                        }
                    } catch (err) {
                        console.error(
                            "Failed to fetch or send to staff log channel:",
                            err
                        );
                    }
                }
            }

            if (command === "wlist") {
                const user =
                    message.mentions.members.first() || message.member;

                const warnings = await getWarnings();
                const userWarns = warnings[user.id] || [];

                if (userWarns.length === 0) {
                    return message.channel.send({
                        embeds: [
                            makeEmbed(
                                "#57F287",
                                "<a:success:1532986625343099050> Clean Record",
                                `<:Shield_2:1532989398642327594> **User**\n${user}\n\n<a:Warning:1532986372716236932> **Warnings**\nNo warnings found.`
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
                    .setThumbnail(
                        user.user.displayAvatarURL({
                            dynamic: true
                        })
                    )
                    .setTitle(
                        "<a:Warning:1532986372716236932> Infraction History"
                    )
                    .setDescription(
                        `<:Shield_2:1532989398642327594> **User**\n${user}\n\n<:Stats:1532990723408793661> **Total Warnings**\n${userWarns.length}/5`
                    )
                    .setFooter({
                        text: "Pixel Villa Support • Moderation"
                    })
                    .setTimestamp();

                userWarns
                    .slice(-5)
                    .reverse()
                    .forEach((warn, index) => {
                        embed.addFields({
                            name: `<a:Warning:1532986372716236932> Warning #${userWarns.length - index} • ID: ${warn.id || "N/A"}`,
                            value:
                                `<:Shield_2:1532989398642327594> **Moderator**\n${warn.moderator}\n\n` +
                                `<a:LP_Message:1532991009066324049> **Reason**\n${warn.reason}\n\n` +
                                `<a:Clock:1532990759371018372> **Date**\n<t:${Math.floor(new Date(warn.timestamp).getTime() / 1000)}:R>`,
                            inline: false
                        });
                    });

                await message.channel.send({
                    embeds: [embed]
                });
            }

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

                if (warnings[user.id].length === 0) {
                    await db.collection("warnings").doc(user.id).delete();
                } else {
                    await db.collection("warnings").doc(user.id).set({
                        warnings: warnings[user.id]
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor("#57F287")
                    .setAuthor({
                        name: "Pixel Villa Support • Warning System",
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setThumbnail(
                        user.user.displayAvatarURL({
                            dynamic: true
                        })
                    )
                    .setTitle(
                        "<a:success:1532986625343099050> Warning Removed"
                    )
                    .setDescription(
                        `<:Shield_2:1532989398642327594> **User**\n${user}\n\n` +
                        `<a:Warning:1532986372716236932> **Warning ID**\n\`${removed.id}\`\n\n` +
                        `<a:LP_Message:1532991009066324049> **Reason**\n${removed.reason}\n\n` +
                        `<:Shield_2:1532989398642327594> **Originally Warned By**\n${removed.moderator}\n\n` +
                        `<a:settings:1532990547394957393> **Removed By**\n${message.author}\n\n` +
                        `<a:sparkles:1532986077651140620> Warning has been removed successfully.`
                    )
                    .setFooter({
                        text: "Pixel Villa Support • Moderation"
                    })
                    .setTimestamp();

                await message.channel.send({
                    embeds: [embed]
                });

                if (config.LOG_CHANNEL_ID) {
                    try {
                        const logChannel = await message.guild.channels.fetch(
                            config.LOG_CHANNEL_ID
                        );

                        if (logChannel) {
                            await logChannel.send({
                                embeds: [embed]
                            });
                        }
                    } catch (err) {
                        console.error(
                            "❌ Warning removal log error:",
                            err
                        );
                    }
                }
            }

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

                await db.collection("warnings").doc(user.id).delete();

                const embed = new EmbedBuilder()
                    .setColor("#57F287")
                    .setAuthor({
                        name: "Pixel Villa Support • Warning System",
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setThumbnail(
                        user.user.displayAvatarURL({
                            dynamic: true
                        })
                    )
                    .setTitle(
                        "<a:success:1532986625343099050> Warning History Reset"
                    )
                    .setDescription(
                        `<:Shield_2:1532989398642327594> **User**\n${user}\n\n` +
                        `<a:Warning:1532986372716236932> **Action**\nAll warnings have been removed\n\n` +
                        `<a:settings:1532990547394957393> **Reset By**\n${message.author}\n\n` +
                        `<a:sparkles:1532986077651140620> Infraction history has been cleared successfully.`
                    )
                    .setFooter({
                        text: "Pixel Villa Support • Moderation"
                    })
                    .setTimestamp();

                await message.channel.send({
                    embeds: [embed]
                });

                if (config.LOG_CHANNEL_ID) {
                    try {
                        const logChannel = await message.guild.channels.fetch(
                            config.LOG_CHANNEL_ID
                        );

                        if (logChannel) {
                            await logChannel.send({
                                embeds: [embed]
                            });
                        }
                    } catch (err) {
                        console.error(
                            "❌ Warning reset log error:",
                            err
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                "Error executing warning structure:",
                error
            );

            message.channel
                .send({
                    embeds: [
                        makeEmbed(
                            "Red",
                            "An error occurred inside the warning system."
                        )
                    ]
                })
                .catch(() => {});
        }
    });
};