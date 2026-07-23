// Location: role.js
const { EmbedBuilder } = require("discord.js");

// In-memory storage for deleted messages per channel (for the snipe feature)
const deletedMessages = new Map();

module.exports = (client) => {
    // 1. Cache deleted messages globally across channels
    client.on("messageDelete", (message) => {
        if (!message.guild || message.author?.bot) return;

        const channelId = message.channel.id;
        if (!deletedMessages.has(channelId)) {
            deletedMessages.set(channelId, []);
        }

        const channelSnipes = deletedMessages.get(channelId);
        
        channelSnipes.unshift({
            author: message.author,
            content: message.content || "[Embed or Attachment]",
            image: message.attachments.first()?.proxyURL || null,
            time: Date.now()
        });

        if (channelSnipes.length > 15) {
            channelSnipes.pop();
        }
    });

    // 2. Handle both role and snipe commands inside role.js (No Prefix)
    client.on("messageCreate", async (message) => {
        try {
            if (message.author.bot || !message.guild) return;

            const args = message.content.trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // ==================== 
            // ROLE COMMAND
            // ====================
            if (command === "role") {
                // 1. EXECUTION PERMISSION CHECK
                if (!message.member.permissions.has("ManageRoles")) {
                    return message.reply("❌ You need the **Manage Roles** permission to use this command.");
                }

                // 2. TARGET MEMBER CHECK
                const member = message.mentions.members.first();
                if (!member) {
                    return message.reply("❌ Please mention a valid user. Example: `role @username Members`");
                }

                // 3. CLEANLY EXTRACT ROLE NAME OR ID
                const roleQuery = args
                    .filter(arg => !arg.match(/<@!?\d+>/))
                    .join(" ")
                    .trim();

                if (!roleQuery) {
                    return message.reply("❌ Please provide a role name, ID, or mention. Example: `role @username Members`");
                }

                // 4. SMART ROLE SEARCH
                const cleanedQuery = roleQuery.toLowerCase();
                const roleMentionId = roleQuery.replace(/[<@&>]/g, "");

                const role = 
                    message.guild.roles.cache.get(roleMentionId) || 
                    message.guild.roles.cache.find(r => r.name.toLowerCase() === cleanedQuery) ||
                    message.guild.roles.cache.find(r => r.name.toLowerCase().includes(cleanedQuery));

                if (!role) {
                    return message.reply(`❌ Could not find a role matching \`${roleQuery}\`.`);
                }

                // 5. MAXIMUM SECURITY HIERARCHY CHECKS
                if (role.position >= message.guild.members.me.roles.highest.position) {
                    return message.reply("❌ I cannot manage this role because it is positioned higher than my highest role in the server settings.");
                }

                if (role.position >= message.member.roles.highest.position && message.guild.ownerId !== message.author.id) {
                    return message.reply("❌ You cannot manage this role because it is equal to or higher than your own highest role.");
                }

                // 6. TOGGLE AND EXECUTE ROLE UPDATE
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    const embed = new EmbedBuilder()
                        .setColor("#e74c3c")
                        .setDescription(`➖ **Role Removed:** Successfully stripped **${role.name}** from ${member}.`)
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                } else {
                    await member.roles.add(role);
                    const embed = new EmbedBuilder()
                        .setColor("#2ecc71")
                        .setDescription(`➕ **Role Added:** Successfully granted **${role.name}** to ${member}.`)
                        .setTimestamp();
                    return message.reply({ embeds: [embed] });
                }
            }

            // ==================== 
            // SNIPE COMMAND
            // ====================
            if (command === "snipe") {
                const channelId = message.channel.id;
                const channelSnipes = deletedMessages.get(channelId);

                if (!channelSnipes || channelSnipes.length === 0) {
                    return message.reply("❌ There are no recently deleted messages to snipe in this channel.");
                }

                const targetUser = message.mentions.users.first();
                let snipeTarget;

                if (targetUser) {
                    snipeTarget = channelSnipes.find((m) => m.author.id === targetUser.id);
                    if (!snipeTarget) {
                        return message.reply(`❌ Could not find any recently deleted messages from **${targetUser.tag}** in this channel.`);
                    }
                } else {
                    snipeTarget = channelSnipes[0];
                }

                const embed = new EmbedBuilder()
                    .setColor("#3498db")
                    .setAuthor({
                        name: `${snipeTarget.author.tag} (${snipeTarget.author.id})`,
                        iconURL: snipeTarget.author.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription(snipeTarget.content)
                    .setFooter({ text: `Snipped by ${message.author.tag}` })
                    .setTimestamp(snipeTarget.time);

                if (snipeTarget.image) {
                    embed.setImage(snipeTarget.image);
                }

                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error("Command Execution Error:", error);
            return message.reply("❌ An error occurred while attempting to process that command.");
        }
    });
};
