const { EmbedBuilder } = require("discord.js");

module.exports = (client) => {
    client.on("messageCreate", async (message) => {
        try {
            // Basic safety checks
            if (message.author.bot || !message.guild) return;

            const args = message.content.trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // Match command name
            if (command !== "role") return;

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
            // Filters out user mentions anywhere in the arguments to get the true role query string
            const roleQuery = args
                .filter(arg => !arg.match(/<@!?\d+>/))
                .join(" ")
                .trim();

            if (!roleQuery) {
                return message.reply("❌ Please provide a role name, ID, or mention. Example: `role @username Members`");
            }

            // 4. SMART ROLE SEARCH (ID -> Mention -> Exact Name -> Partial Name)
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
            
            // Bot Hierarchy Check: Is the role higher than the bot's own power level?
            if (role.position >= message.guild.members.me.roles.highest.position) {
                return message.reply("❌ I cannot manage this role because it is positioned higher than my highest role in the server settings.");
            }

            // Author Hierarchy Check: Prevent lower-level staff from managing roles higher than their own level
            if (role.position >= message.member.roles.highest.position && message.guild.ownerId !== message.author.id) {
                return message.reply("❌ You cannot manage this role because it is equal to or higher than your own highest role.");
            }

            // 6. TOGGLE AND EXECUTE ROLE UPDATE
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                
                const embed = new EmbedBuilder()
                    .setColor("#e74c3c") // Soft Red for removal
                    .setDescription(`➖ **Role Removed:** Successfully stripped **${role.name}** from ${member}.`)
                    .setTimestamp();
                    
                return message.reply({ embeds: [embed] });
            } else {
                await member.roles.add(role);
                
                const embed = new EmbedBuilder()
                    .setColor("#2ecc71") // Vibrant Green for addition
                    .setDescription(`➕ **Role Added:** Successfully granted **${role.name}** to ${member}.`)
                    .setTimestamp();
                    
                return message.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error("Role Command Error:", error);
            return message.reply("❌ An error occurred while attempting to modify this user's roles.");
        }
    });
};
