const { EmbedBuilder } = require("discord.js");

module.exports = (client) => {
    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot) return;

            // Safety guard: Ignore messages with no text content (like images/embeds)
            if (!message.content) return;

            // Extract the first word of the message as the command
            const args = message.content.trim().split(/ +/);
            const command = args[0].toLowerCase();

            // Check if the command is help
            if (command !== "help") return;

            const helpEmbed = new EmbedBuilder()
                .setColor("#5865F2") // Blurple
                .setTitle("Pixel Villa Support")
                .setDescription(
                    "Welcome to Pixel Villa Support!\n\n" +
                    "Note: Moderation and warning actions require the . prefix. Management and utility commands use no prefix."
                )
                .addFields(
                    {
                        name: "Moderation",
                        value:
                        "`.warn @user reason`\n" +
                        "`.mute @user time reason`\n" +
                        "`.unmute @user`\n" +
                        "`.kick @user reason`\n" +
                        "`.ban @user reason`\n" +
                        "`.unban user ID`\n" +
                        "`.nick @user [name]`\n" + 
                        "`.lock`\n" +               
                        "`.unlock`\n" +             
                        "`.wlist`\n" +
                        "`.wremove <id>`\n" +
                        "`.wreset @user`\n" +
                        "`.sticky [message]`\n" +
                        "`.sticky off`",
                        inline: false
                    },
                    {
                        name: "Server Management",
                        value:
                        "`role @user [role name]`\n" +
                        "`addbadword [word]`\n" +
                        "`removebadword [word]`\n" +
                        "`badwordslist`",
                        inline: false
                    },
                    {
                        name: "Utility",
                        value:
                        "`purge amount`\n" +
                        "`afk [reason]`\n" +
                        "`ping`\n" +                 
                        "`uptime`\n" +               
                        "`help`\n" +
                        "`ui [@user]`\n" +
                        "`si`",
                        inline: false
                    },
                    {
                        name: "Voice Master",
                        value:
                        "`vcp`\n" +
                        "`vclock`\n" +
                        "`vcunlock`\n" +
                        "`vchide`\n" +
                        "`vcunhide`\n" +
                        "`vcname [room name]`\n" +
                        "`vclimit [limit]`\n" +
                        "`vckick @user`",
                        inline: false
                    }
                )
                .setFooter({
                    text: "Pixel Villa Support"
                })
                .setTimestamp();

            return message.reply({ embeds: [helpEmbed] });

        } catch (error) {
            console.error("Help Command Error:", error);
        }
    });
};
