const { EmbedBuilder } = require('discord.js');

// Configuration
const LOG_CHANNEL_ID = "1533360058883244153";
const BLURPLE = 0x5865F2;

// Collection to track users currently undergoing the registration process
const activeRegistrations = new Set();

/**
 * Generates a unique registration ID in the format PV-XXXXXX.
 * @returns {string}
 */
function generateRegistrationId() {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `PV-${randomNum}`;
}

/**
 * Validates an email address using a standard regex.
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

module.exports = (client) => {
    client.on("messageCreate", async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Ensure command is run inside a guild/server
        if (!message.guild) return;

        const PREFIX = ".";

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command !== "register") return;

    
        // Ignore bot messages
        if (message.author.bot) return;

        // Ensure command is run inside a guild/server
        if (!message.guild) {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription("This command can only be used inside a server.")
                .setColor(BLURPLE)
                .setTimestamp();
            return message.reply({ embeds: [errorEmbed] });
        }

        const userId = message.author.id;

        // Prevent duplicate registrations
        if (activeRegistrations.has(userId)) {
            const activeEmbed = new EmbedBuilder()
                .setTitle("⚠️ Registration in Progress")
                .setDescription("You already have an active registration process in progress. Please check your DMs.")
                .setColor(BLURPLE)
                .setTimestamp();
            return message.reply({ embeds: [activeEmbed] });
        }

        try {
            // Check if DMs are open by attempting to create DM channel
            const dmChannel = await message.author.createDM();
            
            // Mark user as actively registering
            activeRegistrations.add(userId);

            // Acknowledge in the server channel with a professional embed
            const serverReplyEmbed = new EmbedBuilder()
                .setTitle("✅ Registration Started")
                .setDescription("Check your DMs to continue your registration.")
                .setColor(BLURPLE)
                .setTimestamp();
            await message.reply({ embeds: [serverReplyEmbed] });

            // Define questions array to loop through and reduce repetition
            const questions = [
                { id: 1, text: "What is your Team Name?", validate: (ans) => ans.length > 0, errorMsg: "Team name cannot be empty. Please enter your Team Name:" },
                { id: 2, text: "Provide the Team Leader's In-Game Name (IGN) and Discord ID.", validate: (ans) => ans.length > 0, errorMsg: "This field cannot be empty. Please provide the Team Leader's IGN and Discord ID:" },
                { id: 3, text: "Provide the Second Player's In-Game Name (IGN) and Discord ID.", validate: (ans) => ans.length > 0, errorMsg: "This field cannot be empty. Please provide the Second Player's IGN and Discord ID:" },
                { id: 4, text: "What is the Team Leader's Email Address?", validate: (ans) => isValidEmail(ans), errorMsg: "Invalid email address format. Please enter a valid Team Leader Email Address:" }
            ];

            const answers = [];
            const filter = (response) => response.author.id === userId && !response.author.bot;
            const timeoutDuration = 600000; // 10 minutes in milliseconds

            // Loop through questions dynamically
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const progressPercentage = Math.round((i / questions.length) * 100);

                let currentPrompt = `**Question ${q.id}/4**\nProgress: ${progressPercentage}% Complete\n\n${q.text}`;
                
                let promptEmbed = new EmbedBuilder()
                    .setTitle("📋 Tournament Registration")
                    .setDescription(currentPrompt)
                    .setColor(BLURPLE)
                    .setFooter({ text: "Pixel Villa • Tournament Registration" })
                    .setTimestamp();

                await dmChannel.send({ embeds: [promptEmbed] });

                let validAnswerReceived = false;
                let finalAnswer = "";

                while (!validAnswerReceived) {
                    try {
                        const collected = await dmChannel.awaitMessages({
    filter,
    max: 1,
    time: timeoutDuration,
    errors: ['time']
});

const responseMessage = collected.first();

console.log("User replied:", responseMessage.content);

finalAnswer = responseMessage.content.trim();

                        if (q.validate(finalAnswer)) {
                            validAnswerReceived = true;
                        } else {
                            // If invalid or empty, prompt again without cancelling
                            let retryEmbed = new EmbedBuilder()
                                .setTitle("⚠️ Invalid Input")
                                .setDescription(`❌ ${q.errorMsg}`)
                                .setColor(BLURPLE)
                                .setFooter({ text: "Pixel Villa • Tournament Registration" })
                                .setTimestamp();
                            await dmChannel.send({ embeds: [retryEmbed] });
                        }
                    } catch (error) {
                        // Handle timeout per question
                        activeRegistrations.delete(userId);
                        let timeoutEmbed = new EmbedBuilder()
                            .setTitle("❌ Registration Expired")
                            .setDescription("Your registration has expired due to inactivity. Please run `.register` again.")
                            .setColor(BLURPLE)
                            .setFooter({ text: "Pixel Villa • Tournament Registration" })
                            .setTimestamp();
                        await dmChannel.send({ embeds: [timeoutEmbed] });
                        return;
                    }
                }

                answers.push(finalAnswer);
            }

            // Remove user from active registrations map once successfully collected
            activeRegistrations.delete(userId);

            // Generate unique Registration ID
            const registrationId = generateRegistrationId();

            // Fetch the log channel
            const logChannel = message.client.channels.cache.get(LOG_CHANNEL_ID);
            if (!logChannel || !logChannel.isTextBased()) {
                const internalErrorEmbed = new EmbedBuilder()
                    .setTitle("❌ Internal Error")
                    .setDescription("An internal error occurred while submitting your registration. Please contact a staff member.")
                    .setColor(BLURPLE)
                    .setFooter({ text: "Pixel Villa • Tournament Registration" })
                    .setTimestamp();
                await dmChannel.send({ embeds: [internalErrorEmbed] });
                return;
            }

            const currentTimestamp = Math.floor(Date.now() / 1000);

            // Build professional log embed with fields in exact specified order
            const logEmbed = new EmbedBuilder()
                .setTitle("📋 New Tournament Registration")
                .setDescription("A new tournament registration has been submitted.")
                .setColor(BLURPLE)
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: "• Registration ID", value: registrationId, inline: false },
                    { name: "• Applicant", value: `${message.author.tag}`, inline: false },
                    { name: "• User ID", value: `${message.author.id}`, inline: false },
                    { name: "• Team Name", value: answers[0], inline: false },
                    { name: "• Team Leader (IGN + Discord ID)", value: answers[1], inline: false },
                    { name: "• Second Player (IGN + Discord ID)", value: answers[2], inline: false },
                    { name: "• Team Leader Email", value: answers[3], inline: false },
                    { name: "• Submitted", value: `<t:${currentTimestamp}:F> (<t:${currentTimestamp}:R>)`, inline: false }
                )
                .setFooter({ text: "Pixel Villa • Tournament Registration" })
                .setTimestamp();

            // Send mention and embed to the log channel
            await logChannel.send({
                content: `<@${message.author.id}>`,
                embeds: [logEmbed]
            });

            // Send success embed to the user's DMs
            const userSuccessEmbed = new EmbedBuilder()
                .setTitle("✅ Registration Successful")
                .setDescription(`Your registration has been submitted successfully! Thank you for registering.\n\n**Registration ID:** ${registrationId}`)
                .setColor(BLURPLE)
                .setFooter({ text: "Pixel Villa • Tournament Registration" })
                .setTimestamp();
            await dmChannel.send({ embeds: [userSuccessEmbed] });

            // Confirm in the server that the registration was submitted
            const serverSuccessEmbed = new EmbedBuilder()
                .setTitle("✅ Registration Submitted")
                .setDescription(`<@${message.author.id}>, your registration has been successfully submitted! Check your DMs for details.`)
                .setColor(BLURPLE)
                .setTimestamp();
            await message.channel.send({ embeds: [serverSuccessEmbed] });

        } catch (error) {
            // Handle closed DMs or unexpected execution errors
            activeRegistrations.delete(userId);
            try {
                const dmErrorEmbed = new EmbedBuilder()
                    .setTitle("❌ Error")
                    .setDescription("I couldn't DM you. Please enable Direct Messages and try again.")
                    .setColor(BLURPLE)
                    .setTimestamp();
                await message.reply({ embeds: [dmErrorEmbed] });
            } catch {
                // Fail silently if unable to reply to message
            }
                }
    });
};
    

