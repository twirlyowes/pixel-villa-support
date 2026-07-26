/**
 * ============================================================================
 * PRODUCTION-READY DISCORD.JS V14 VERIFICATION, ROLE & SNIPE SYSTEM
 * ============================================================================
 */

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits,
    ChannelType 
} = require('discord.js');

// ==================== CONFIGURATION CONSTANTS ====================
const VERIFY_CHANNEL_ID = '1522850335415078922'; // Updated verification channel ID
const LOG_CHANNEL_ID = '1510632065622741029';     // Updated log channel ID

const VERIFIED_ROLE_ID = '';   // Optional: Leave empty to find by name 'Verified' or set ID
const UNVERIFIED_ROLE_ID = ''; // Optional: Leave empty to find by name 'Unverified' or set ID

// ==================== IN-MEMORY STORAGE ====================
const pendingCaptchas = new Map(); // userId -> { answer, attempts, timeoutId }
const cooldowns = new Map();       // userId -> timestamp expiration
const deletedMessages = new Map(); // channelId -> Array of up to 15 deleted messages

module.exports = function(client) {
    // 1. Global Message Deletion Caching (Snipe System)
    client.on("messageDelete", (message) => {
        try {
            if (!message || !message.guild || message.author?.bot) return;

            const channelId = message.channel.id;
            if (!deletedMessages.has(channelId)) {
                deletedMessages.set(channelId, []);
            }

            const channelSnipes = deletedMessages.get(channelId);
            
            let content = message.content || "";
            if (message.stickers && message.stickers.size > 0) {
                const stickerNames = message.stickers.map(s => s.name).join(", ");
                content += ` [Sticker: ${stickerNames}]`;
            }
            if (!content.trim()) {
                content = "[Embed or Attachment]";
            }

            channelSnipes.unshift({
                author: message.author,
                content: content,
                image: message.attachments.first()?.proxyURL || null,
                time: Date.now()
            });

            if (channelSnipes.length > 15) {
                channelSnipes.pop();
            }
        } catch (error) {
            console.error("Error handling message deletion cache:", error);
        }
    });

    // 2. Command Handler (.setup..., role, snipe)
    client.on('messageCreate', async message => {
        try {
            if (!message || message.author.bot || !message.guild) return;
            
            const content = message.content.trim();
            const args = content.split(/ +/);
            const command = args.shift().toLowerCase();

            // ==================== SETUP COMMANDS ====================
            if (content === '.setup unverify role') {
                return await setupUnverifiedRole(message);
            } 
            if (content === '.setup verify role') {
                return await setupVerifiedRole(message);
            } 
            if (content === '.setupverify') {
                await sendVerificationPanel(message.client);
                return await message.reply('✅ Verification panel deployed successfully.');
            }

            // ==================== ROLE MANAGEMENT COMMAND ====================
            if (command === "role") {
                if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ You lack the **Manage Roles** permission required to execute this command.");
                    return message.reply({ embeds: [embed] });
                }

                if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ I lack the **Manage Roles** permission required to modify roles in this server.");
                    return message.reply({ embeds: [embed] });
                }

                const member = message.mentions.members.first();
                if (!member) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ Please mention a valid server member. Example: `role @username Members`");
                    return message.reply({ embeds: [embed] });
                }

                const roleQuery = args
                    .filter(arg => !arg.match(/<@!?\d+>/))
                    .join(" ")
                    .trim();

                if (!roleQuery) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ Please specify a target role name, ID, or mention. Example: `role @username Members`");
                    return message.reply({ embeds: [embed] });
                }

                const cleanedQuery = roleQuery.toLowerCase();
                const roleMentionId = roleQuery.replace(/[<@&>]/g, "");

                const role = 
                    message.guild.roles.cache.get(roleMentionId) || 
                    message.guild.roles.cache.find(r => r.name.toLowerCase() === cleanedQuery) ||
                    message.guild.roles.cache.find(r => r.name.toLowerCase().includes(cleanedQuery));

                if (!role) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription(`❌ Could not locate any matching role for \`${roleQuery}\`.`);
                    return message.reply({ embeds: [embed] });
                }

                if (member.permissions.has(PermissionFlagsBits.Administrator) && message.guild.ownerId !== message.author.id) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ You cannot modify roles for server administrators unless you are the server owner.");
                    return message.reply({ embeds: [embed] });
                }

                if (role.position >= message.guild.members.me.roles.highest.position) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ I cannot manage this role because it is positioned higher than or equal to my highest role.");
                    return message.reply({ embeds: [embed] });
                }

                if (role.position >= message.member.roles.highest.position && message.guild.ownerId !== message.author.id) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ You cannot manage this role because it is positioned higher than or equal to your own highest role.");
                    return message.reply({ embeds: [embed] });
                }

                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription(`➖ **Role Removed:** Successfully revoked **${role.name}** from ${member}.`)
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                } else {
                    await member.roles.add(role);
                    const embed = new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setDescription(`➕ **Role Added:** Successfully assigned **${role.name}** to ${member}.`)
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            }

            // ==================== SNIPE COMMAND ====================
            if (command === "snipe") {
                const channelId = message.channel.id;
                const channelSnipes = deletedMessages.get(channelId);

                if (!channelSnipes || channelSnipes.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setDescription("❌ There are no recently deleted messages recorded in this channel.");
                    return message.reply({ embeds: [embed] });
                }

                const targetUser = message.mentions.users.first();
                let snipeTarget;

                if (targetUser) {
                    snipeTarget = channelSnipes.find((m) => m.author.id === targetUser.id);
                    if (!snipeTarget) {
                        const embed = new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setDescription(`❌ Could not find any cached deleted messages from **${targetUser.tag}** in this channel.`);
                        return message.reply({ embeds: [embed] });
                    }
                } else {
                    snipeTarget = channelSnipes[0];
                }

                const embed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setAuthor({
                        name: `${snipeTarget.author.tag} (${snipeTarget.author.id})`,
                        iconURL: snipeTarget.author.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription(snipeTarget.content || "[No Content Available]")
                    .setFooter({ text: `Snipe requested by ${message.author.tag}` })
                    .setTimestamp(snipeTarget.time);

                if (snipeTarget.image) {
                    embed.setImage(snipeTarget.image);
                }

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error("Command Execution Error:", error);
            return message.reply("❌ An error occurred while attempting to process that command.").catch(() => {});
        }
    });

    // 3. Interaction Handler (Verify Button & Captcha Modal Submissions)
    client.on('interactionCreate', async interaction => {
        try {
            if (interaction.isButton()) {
                if (interaction.customId !== 'start_verify_btn') return;

                const userId = interaction.user.id;
                const now = Date.now();

                if (cooldowns.has(userId)) {
                    const expirationTime = cooldowns.get(userId);
                    if (now < expirationTime) {
                        const timeLeftMinutes = Math.ceil((expirationTime - now) / 1000 / 60);
                        return interaction.reply({ 
                            content: `❌ Security Cooldown Active: You have exceeded maximum failed attempts. Please try again in approximately **${timeLeftMinutes} minute(s)**.`, 
                            ephemeral: true 
                        });
                    } else {
                        cooldowns.delete(userId);
                    }
                }

                if (pendingCaptchas.has(userId)) {
                    return interaction.reply({ 
                        content: `⚠️ You already have an active verification session pending. Please complete the open modal prompt or wait for it to time out.`, 
                        ephemeral: true 
                    });
                }

                // Math Captcha Generation (+, -, *)
                const operators = ['+', '-', '*'];
                const operator = operators[Math.floor(Math.random() * operators.length)];
                let num1, num2, correctAnswer;

                if (operator === '+') {
                    num1 = Math.floor(Math.random() * 12) + 1;
                    num2 = Math.floor(Math.random() * 12) + 1;
                    correctAnswer = num1 + num2;
                } else if (operator === '-') {
                    num1 = Math.floor(Math.random() * 12) + 5;
                    num2 = Math.floor(Math.random() * num1) + 1;
                    correctAnswer = num1 - num2;
                } else {
                    num1 = Math.floor(Math.random() * 8) + 1;
                    num2 = Math.floor(Math.random() * 5) + 1;
                    correctAnswer = num1 * num2;
                }

                const timeoutId = setTimeout(() => {
                    if (pendingCaptchas.has(userId)) {
                        pendingCaptchas.delete(userId);
                    }
                }, 60000);

                pendingCaptchas.set(userId, {
                    answer: correctAnswer,
                    attempts: 0,
                    timeoutId: timeoutId
                });

                const modal = new ModalBuilder()
                    .setCustomId('verify_modal')
                    .setTitle('Security Checkpoint');

                const mathInput = new TextInputBuilder()
                    .setCustomId('math_answer_input')
                    .setLabel(`Solve: What is ${num1} ${operator} ${num2}?`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter numeric answer...')
                    .setRequired(true);

                const row = new ActionRowBuilder().addComponents(mathInput);
                modal.addComponents(row);

                await interaction.showModal(modal);

            } else if (interaction.isModalSubmit()) {
                if (interaction.customId !== 'verify_modal') return;

                await interaction.deferReply({ ephemeral: true });

                const userId = interaction.user.id;
                const userCaptcha = pendingCaptchas.get(userId);

                if (!userCaptcha) {
                    return interaction.editReply({ content: '❌ Verification session expired or not found. Please click the verify button again.' });
                }

                const rawInput = interaction.fields.getTextInputValue('math_answer_input').trim();
                const numericValue = Number(rawInput);

                if (!rawInput || !Number.isInteger(numericValue)) {
                    userCaptcha.attempts += 1;
                    
                    if (userCaptcha.attempts >= 3) {
                        clearTimeout(userCaptcha.timeoutId);
                        pendingCaptchas.delete(userId);
                        cooldowns.set(userId, Date.now() + (5 * 60 * 1000));
                        return interaction.editReply({ content: '❌ Invalid input format. You have exhausted your 3 attempts and are temporarily locked out for **5 minutes**.' });
                    }

                    const attemptsLeft = 3 - userCaptcha.attempts;
                    return interaction.editReply({ content: `❌ Invalid numeric value provided. You have **${attemptsLeft} attempt(s)** remaining.` });
                }

                if (numericValue === userCaptcha.answer) {
                    clearTimeout(userCaptcha.timeoutId);
                    pendingCaptchas.delete(userId);
                    cooldowns.delete(userId);

                    const member = interaction.member;
                    const guild = interaction.guild;

                    const verifiedRole = VERIFIED_ROLE_ID 
                        ? guild.roles.cache.get(VERIFIED_ROLE_ID) 
                        : guild.roles.cache.find(r => r.name.toLowerCase() === 'verified');
                        
                    const unverifiedRole = UNVERIFIED_ROLE_ID 
                        ? guild.roles.cache.get(UNVERIFIED_ROLE_ID) 
                        : guild.roles.cache.find(r => r.name.toLowerCase() === 'unverified');

                    if (!verifiedRole) {
                        return interaction.editReply({ content: '❌ Critical Configuration Error: The **Verified** role could not be located in this server.' });
                    }

                    if (member.roles.cache.has(verifiedRole.id)) {
                        return interaction.editReply({ content: 'ℹ️ You are already verified in this server!' });
                    }

                    await member.roles.add(verifiedRole).catch(err => console.error("Failed adding verified role:", err));
                    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
                        await member.roles.remove(unverifiedRole).catch(err => console.error("Failed removing unverified role:", err));
                    }

                    await interaction.editReply({ content: '✅ Correct! Verification successful. Server access granted.' });

                    if (LOG_CHANNEL_ID) {
                        const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('User Verification Succeeded')
                                .setDescription(`**${member.user.tag}** (\`${member.id}\`) successfully solved the math CAPTCHA and obtained access.`)
                                .setColor(0x2ecc71)
                                .setTimestamp();
                            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                        }
                    }

                } else {
                    userCaptcha.attempts += 1;

                    if (userCaptcha.attempts >= 3) {
                        clearTimeout(userCaptcha.timeoutId);
                        pendingCaptchas.delete(userId);
                        cooldowns.set(userId, Date.now() + (5 * 60 * 1000));

                        if (LOG_CHANNEL_ID) {
                            const guild = interaction.guild;
                            const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                            if (logChannel) {
                                const logEmbed = new EmbedBuilder()
                                    .setTitle('User Verification Failed')
                                    .setDescription(`**${interaction.user.tag}** (\`${interaction.user.id}\`) failed the CAPTCHA 3 times and is locked out for 5 minutes.`)
                                    .setColor(0xe74c3c)
                                    .setTimestamp();
                                await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                            }
                        }

                        return interaction.editReply({ content: '❌ Incorrect answer. You have failed 3 times and are temporarily locked out for **5 minutes**.' });
                    }

                    const attemptsLeft = 3 - userCaptcha.attempts;
                    return interaction.editReply({ content: `❌ Incorrect answer! You have **${attemptsLeft} attempt(s)** remaining. Click the verify button again to try a new question.` });
                }
            }
        } catch (error) {
            console.error("Interaction execution error:", error);
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An unexpected error occurred while processing your request.', ephemeral: true }).catch(() => {});
            }
        }
    });
};

// Helper function to send or edit the verification panel
async function sendVerificationPanel(client) {
    try {
        const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
        if (!channel) {
            return console.error('Verification panel target channel could not be fetched.');
        }

        const embed = new EmbedBuilder()
            .setTitle('Server Verification Checkpoint')
            .setDescription('Click the **Verify** button below to complete a quick mathematical safety CAPTCHA and unlock the server channels.')
            .setColor(0x2ecc71)
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start_verify_btn')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅')
            );

        const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        if (messages) {
            const existingPanel = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
            if (existingPanel) {
                await existingPanel.edit({ embeds: [embed], components: [row] });
                return;
            }
        }

        await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Error deploying verification panel:', error);
    }
}
