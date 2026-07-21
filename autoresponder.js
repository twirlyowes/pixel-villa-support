module.exports = (client) => {
    client.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Only respond if the message is exactly "ip"
        if (message.content.trim().toLowerCase() !== "ip") return;

        message.reply(
            "** Pixel Villa Server IP**\n\n" +
            "** Java Edition**\n" +
            "`mc.pixelvilla.fun:25575`\n\n" +
            "** Bedrock Edition**\n" +
            "**IP:** `mc.pixelvilla.fun`\n" +
            "**Port:** `25575`"
        );
    });
};
