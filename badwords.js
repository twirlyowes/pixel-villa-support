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

const normalized = message.content.toLowerCase();

let found = false;

for (const word of badWordsCache) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

    if (regex.test(normalized)) {
        found = true;
        break;
    }
}

if (!found) return;

            const deletedMessage = message.content;

            // Delete offensive message safely
            await message.delete().catch(() => {});

            // Send temporary channel warning
            const warn = await message.channel.send({
    embeds: [
        new EmbedBuilder()
            .setColor("#F1C40F")
            .setAuthor({
                name: "Pixel Villa Support • Auto Moderation",
                iconURL: client.user.displayAvatarURL()
            })
            .setDescription(
`<a:Warning:1532986372716236932> ${message.author}

Your message has been removed because it contained a prohibited word.

Please follow the server rules and keep the chat respectful.`
            )
    ]
}).catch(() => null);

            if (warn) {
                setTimeout(() => {
                    warn.delete().catch(() => {});
                }, 5000);
            }

            // Send logging payload
            const logChannel = message.guild.channels.cache.get(config.LOG_CHANNEL_ID);

if (logChannel) {
    const embed = new EmbedBuilder()
        .setColor("#ED4245")
        .setAuthor({
            name: "Pixel Villa Support • Auto Moderation",
            iconURL: client.user.displayAvatarURL()
        })
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setDescription(
`<a:Warning:1532986372716236932> **Prohibited Word Detected**

━━━━━━━━━━━━━━━━━━━━━━

<:Shield_2:1532989398642327594> **User**
> ${message.author} (\`${message.author.id}\`)

<:HOME:1532991400503673055> **Channel**
> ${message.channel}

<a:LP_Message:1532991009066324049> **Deleted Message**
\`\`\`
${deletedMessage.slice(0, 1000)}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━

<a:error:1532986765105696778> The message has been automatically removed by the filter.`
        )
        .setFooter({
            text: "Pixel Villa Support • Moderation Logs"
        })
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
}

} catch (error) {
    console.error("Filter System Error:", error);
}
});
};
