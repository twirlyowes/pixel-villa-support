const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require("discord.js");

module.exports = (client) => {
    const LOG_CHANNEL_ID = "1533360058883244153";
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot || !message.guild) return;
            if (message.content.trim() === ".register") {
                const buttonId = `pv_register_button_${message.author.id}`;

                const embed = new EmbedBuilder()
                    .setTitle("📋 Tournament Registration")
                    .setDescription("Click the button below to begin your tournament registration.")
                    .setColor(0x5865F2)
                    .setFooter({ text: "Pixel Villa • Tournament Registration" });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(buttonId)
                        .setLabel("Register")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📝")
                );

                await message.channel.send({
                    embeds: [embed],
                    components: [row]
                });
            }
        } catch (error) {
            console.error("Error in messageCreate handler for .register:", error);
        }
    });

    client.on("interactionCreate", async (interaction) => {
        try {
            if (interaction.isButton()) {
                if (!interaction.customId.startsWith("pv_register_button_")) return;

                const targetUserId = interaction.customId.split("_")[3];

                if (interaction.user.id !== targetUserId) {
                    return interaction.reply({
                        content: "❌ This registration button belongs to another user.",
                        ephemeral: true
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`pv_register_modal_${interaction.user.id}`)
                    .setTitle("Tournament Registration");

                const teamNameInput = new TextInputBuilder()
                    .setCustomId("team_name")
                    .setLabel("Team Name")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const leaderInput = new TextInputBuilder()
                    .setCustomId("team_leader")
                    .setLabel("Team Leader IGN + Discord ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const secondPlayerInput = new TextInputBuilder()
                    .setCustomId("second_player")
                    .setLabel("Second Player IGN + Discord ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const emailInput = new TextInputBuilder()
                    .setCustomId("team_email")
                    .setLabel("Team Leader Email")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(leaderInput),
                    new ActionRowBuilder().addComponents(secondPlayerInput),
                    new ActionRowBuilder().addComponents(emailInput)
                );

                await interaction.showModal(modal);

                try {
                    const disabledButton = new ButtonBuilder()
                        .setCustomId(interaction.customId)
                        .setLabel("Register")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📝")
                        .setDisabled(true);

                    const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
                    await interaction.message.edit({ components: [disabledRow] });
                } catch (editError) {
                    console.error("Failed to disable registration button:", editError);
                }
            } else if (interaction.isModalSubmit()) {
                if (!interaction.customId.startsWith("pv_register_modal_")) return;

                const teamName = interaction.fields.getTextInputValue("team_name");
                const teamLeader = interaction.fields.getTextInputValue("team_leader");
                const secondPlayer = interaction.fields.getTextInputValue("second_player");
                const teamEmail = interaction.fields.getTextInputValue("team_email");

                if (!EMAIL_REGEX.test(teamEmail)) {
                    return interaction.reply({
                        content: "❌ Invalid email format. Please submit again with a valid email.",
                        ephemeral: true
                    });
                }

                const registrationId = `PV-${Math.floor(100000 + Math.random() * 900000)}`;
                const timestamp = Math.floor(Date.now() / 1000);

                const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID) || await interaction.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

                if (!logChannel || logChannel.type !== ChannelType.GuildText) {
                    console.error("Log channel not found or is not a text channel.");
                    return interaction.reply({
                        content: "❌ An internal error occurred while processing your registration. Please contact an administrator.",
                        ephemeral: true
                    });
                }

                const logEmbed = new EmbedBuilder()
                    .setTitle("📋 New Tournament Registration")
                    .setColor(0x5865F2)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: "Registration ID", value: registrationId, inline: false },
                        { name: "Applicant", value: `${interaction.user}`, inline: true },
                        { name: "User ID", value: interaction.user.id, inline: true },
                        { name: "Team Name", value: teamName, inline: false },
                        { name: "Team Leader (IGN + Discord ID)", value: teamLeader, inline: false },
                        { name: "Second Player (IGN + Discord ID)", value: secondPlayer, inline: false },
                        { name: "Team Leader Email", value: teamEmail, inline: false },
                        { name: "Submitted", value: `<t:${timestamp}:F> (<t:${timestamp}:R>)`, inline: false }
                    )
                    .setFooter({ text: "Pixel Villa • Tournament Registration" })
                    .setTimestamp();

                try {
                    await logChannel.send({
                        content: `${interaction.user}`,
                        embeds: [logEmbed]
                    });
                } catch (sendError) {
                    console.error("Failed to send message to log channel (check bot permissions):", sendError);
                    return interaction.reply({
                        content: "❌ Failed to send registration logs due to missing permissions. Please contact an administrator.",
                        ephemeral: true
                    });
                }

                const userEmbed = new EmbedBuilder()
                    .setTitle("✅ Registration Submitted")
                    .setDescription("Your registration has been submitted successfully.")
                    .setColor(0x5865F2)
                    .addFields(
                        { name: "Registration ID", value: registrationId, inline: false }
                    );

                await interaction.reply({
                    embeds: [userEmbed],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error("Error in interactionCreate handler:", error);
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: "❌ An unexpected error occurred while processing your request.",
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.error("Failed to send error reply:", replyError);
                }
            }
        }
    });
};
