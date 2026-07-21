const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const config = require("./config.json");

const badWordsFile = path.join(__dirname, "badwords.json");

// In-memory cache for ultra-fast filtering checks
let badWordsCache = new Set();

function loadBadWords() {
    try {
        if (!fs.existsSync(badWordsFile)) {
            fs.writeFileSync(badWordsFile, JSON.stringify({ words: [] }, null, 2), "utf8");
            return;
        }
        const raw = fs.readFileSync(badWordsFile, "utf8");
        const parsed = JSON.parse(raw || '{"words":[]}');
        badWordsCache = new Set(parsed.words.map(w => w.toLowerCase()));
    } catch (error) {
        console.error("Failed to load bad words file:", error);
    }
}

function saveBadWords() {
    try {
        const data = { words: Array.from(badWordsCache) };
        fs.writeFileSync(badWordsFile, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
        console.error("Failed to save bad words file:", error);
    }
}

module.exports = (client) => {
    // Initial data load on startup
    loadBadWords();

    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot || !message.guild) return;

            // ==========================================
            // MODULE 1: STAFF COMMANDS (Add, Remove, List)
            // ==========================================
            const isStaff = message.member.roles.cache.has(config.STAFF_ROLE_ID);
            const args = message.content.trim().split(/\s+/);
            const command = args[0].toLowerCase();

            if (isStaff) {
                // Add Word
                if (command === "addbadword") {
                    if (!args[1]) return message.reply("Provide a word.");
                    
                    const word = args[1].toLowerCase();
                    if (badWordsCache.has(word)) return message.reply("Word already exists.");

                    badWordsCache.add(word);
                    saveBadWords();
                    return message.reply("Bad word added.");
                }

                // Remove Word
                if (command === "removebadword") {
                    if (!args[1]) return message.reply("Provide a word.");
                    
                    const word = args[1].toLowerCase();
                    if (!badWordsCache.has(word)) return message.reply("Word not found in database.");

                    badWordsCache.delete(word);
                    saveBadWords();
                    return message.reply("Bad word removed.");
                }

                // New Feature: List All Words
                if (command === "badwordslist") {
                    const list = Array.from(badWordsCache);
                    if (list.length === 0) return message.reply("The bad words list is empty.");

                    const embed = new EmbedBuilder()
                        .setTitle("Prohibited Words List")
                        .setColor("#5865F2")
                        .setDescription(`\`\`\`${list.join(", ")}\`\`\``)
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                }
            }

            // ==========================================
            // MODULE 2: BAD WORD FILTER (Skips Staff)
            // ==========================================
            if (isStaff) return;

            // Check the message against cached filter entries
            const contentLower = message.content.toLowerCase();
            let found = false;

            for (const word of badWordsCache) {
                const regex = new RegExp(`(^|\\s|[.,!?])${word}($|\\s|[.,!?])`, "i");
                if (regex.test(contentLower)) {
                    found = true;
                    break;
                }
            }

            if (!found) return;

            const deletedMessage = message.content;

            // Delete offensive message safely
            await message.delete().catch(() => {});

            // Send temporary channel warning
            const warn = await message.channel.send(
                `${message.author}, your message was removed because it contained a prohibited word.`
            ).catch(() => null);

            if (warn) {
                setTimeout(() => {
                    warn.delete().catch(() => {});
                }, 5000);
            }

            // Send logging payload
            const logChannel = message.guild.channels.cache.get(config.LOG_CHANNEL_ID);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle("Bad Word Detected")
                    .setColor("#E74C3C") // Red
                    .addFields(
                        { name: "User", value: `${message.author} (${message.author.id})` },
                        { name: "Channel", value: `${message.channel}` },
                        { name: "Message", value: deletedMessage.slice(0, 1024) }
                    )
                    .setTimestamp();

                logChannel.send({ embeds: [embed] }).catch(() => {});
            }

        } catch (error) {
            console.error("Filter System Error:", error);
        }
    });
};
