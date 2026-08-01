const { EmbedBuilder } = require("discord.js");

module.exports = (client) => {
    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot) return;

            // Safety guard: Ignore messages with no text content
            if (!message.content) return;

            // Extract the first word of the message as the command
            const args = message.content.trim().split(/ +/);
            const command = args[0].toLowerCase();

            // Check if the command is help
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
            name: "<a:ban:1532989769766801511> Moderation",
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
            inline: true
        },
        {
            name: "<a:settings:1532990547394957393> Management",
            value:
            "```" +
            "role" +
            "```",
            inline: true
        },
        {
            name: "<:terminal:1532991459005829264> Utility",
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
        text: "Pixel Villa Support • Developed with ❤️"
    })
    .setTimestamp();
            return message.reply({ embeds: [helpEmbed] });

        } catch (error) {
            console.error("Help Command Error:", error);
        }
    });
};
