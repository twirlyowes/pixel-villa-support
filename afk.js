// Location: afk.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// --- JSONBIN CONFIGURATION FOR AFK ---
const BIN_ID = "6a61ad17da38895dfe82b608";
const API_KEY = "$2a$10$aCLBlkuqB51DVhDxNoqisureJOzr5ljUp6AyTncij4YryQSiAKPwa";
// -------------------------------------

let afkData = new Map(); // Key: ID (userId or guildId_userId), Value: { scope, reason, time, setupAt }
let saveTimeout = null;
let lastToggleTime = new Map(); // Cooldown tracker for rapid toggling

async function loadAFK() {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            headers: { "X-Master-Key": API_KEY }
        });
        const data = await response.json();
        const parsed = data.record || {};
        afkData = new Map(Object.entries(parsed));    
    } catch (error) {                                     
        console.error("Failed to load AFK database from JSONBin:", error);
        afkData = new Map();
    }                                             
}

// Debounced save function (5 seconds cooldown before writing to JSONBin)
function queueSaveAFK() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {                                                 
            const obj = Object.fromEntries(afkData);
            await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Master-Key": API_KEY
                },
                body: JSON.stringify(obj)
            });
        } catch (error) {                                     
            console.error("Failed to save AFK database to JSONBin:", error);
        }
    }, 5000);
}                                                 

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);            
    if (seconds < 60) return `${seconds}s`;
    const days = Math.floor(seconds / 86400);         
    const hours = Math.floor((seconds % 86400) / 3600);                                                 
    const minutes = Math.floor((seconds % 3600) / 60);

    let parts = [];
    if (days) parts.push(`${days}d`);                 
    if (hours) parts.push(`${hours}h`);               
    if (minutes) parts.push(`${minutes}m`);

    return parts.join(" ");                       
}
                                                  
function formatTime(time) {                           
    return `<t:${Math.floor(time / 1000)}:f> (<t:${Math.floor(time / 1000)}:R>)`;
}

module.exports = (client) => {                        
    loadAFK();

    client.on("messageCreate", async (message) => {                                                         
        try {
            if (message.author.bot || !message.guild) return;                                                                                                     
            const content = message.content.trim();
            const lowerContent = content.toLowerCase();
            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            const displayName = member ? member.displayName : message.author.username;

            // Keys for lookup
            const globalKey = message.author.id;
            const serverKey = `${message.guild.id}_${message.author.id}`;

            // ==========================================                                                       
            // MODULE 1: CHECK MENTIONS FIRST                 
            // ==========================================                                                       
            if (message.mentions.users.size > 0) {
                const mentions = [];

                for (const user of message.mentions.users.values()) {
                    if (user.id === message.author.id || user.bot) continue; // Ignore self pings & bots

                    // Check Server-specific first, then Global
                    const sKey = `${message.guild.id}_${user.id}`;
                    const targetData = afkData.get(sKey) || afkData.get(user.id);

                    if (targetData) {
                        const targetMember = await message.guild.members.fetch(user.id).catch(() => null);
                        const targetName = targetMember ? targetMember.displayName : user.username;
                        const scopeEmoji = targetData.scope === "global" ? "🌎" : "🏠";

                        mentions.push(                                        
                            `${scopeEmoji} **${targetName}** is currently away:\n` +
                            `Reason: ${targetData.reason}\n` +
                            `Since: ${formatTime(targetData.time)}`
                        );
                    }
                }
                                                                  
                if (mentions.length > 0) {
                    const embed = new EmbedBuilder()
                        .setColor("#e67e22") // Warm Orange
                        .setTitle("Status: Away")
                        .setDescription(mentions.join("\n\n"))                                                              
                        .setTimestamp();          
                    
                    return message.channel.send({ embeds: [embed] });                                           
                }
            }                                                                                                   
            
            // ==========================================
            // MODULE 2: SET AFK STATUS (With Scope & Cooldown)
            // ==========================================
            if (lowerContent.startsWith("afk")) {
                // Prevent rapid toggling (5 seconds cooldown)
                const lastToggle = lastToggleTime.get(message.author.id) || 0;
                if (Date.now() - lastToggle < 5000) {
                    return message.reply({ content: "⚠️ Please wait a few seconds before changing your AFK status again.", ephemeral: true }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 4000);
                    });
                }
                lastToggleTime.set(message.author.id, Date.now());

                const args = content.slice(3).trim().split(/ +/);
                let scope = "server"; // Default to server-specific
                let reasonIndex = 0;

                if (args[0] && args[0].toLowerCase() === "global") {
                    scope = "global";
                    reasonIndex = 1;
                } else if (args[0] && args[0].toLowerCase() === "server") {
                    scope = "server";
                    reasonIndex = 1;
                }

                const reason = args.slice(reasonIndex).join(" ").trim() || "No reason provided";
                const time = Date.now();
                const storageKey = scope === "global" ? globalKey : serverKey;

                afkData.set(storageKey, {
                    scope,
                    reason,
                    time,                                             
                    setupAt: time
                });                                               
                queueSaveAFK();

                const scopeText = scope === "global" ? "🌎 Global AFK" : "🏠 Server AFK";
                const embed = new EmbedBuilder()
                    .setColor("#f1c40f") // Yellow                    
                    .setAuthor({
                        name: `${displayName} is now AFK (${scopeText})`,                                                      
                        iconURL: message.author.displayAvatarURL({ dynamic: true, extension: 'png' })
                    })                                                
                    .setDescription(`Status updated successfully.`)
                    .addFields(
                        { name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false },                                  
                        { name: "Set At", value: formatTime(time), inline: false }
                    )
                    .setFooter({ text: "I will notify users who mention you." })
                    .setTimestamp();

                // Add Cancel Button
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`cancel_afk_${message.author.id}`)
                        .setLabel("Cancel AFK")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌")
                );

                const sentMsg = await message.channel.send({ embeds: [embed], components: [row] });

                // Collector for the Cancel Button (valid for 10 minutes)
                const filter = i => i.user.id === message.author.id && i.customId === `cancel_afk_${message.author.id}`;
                const collector = sentMsg.createMessageComponentCollector({ filter, time: 600000 });

                collector.on('collect', async i => {
                    afkData.delete(storageKey);
                    queueSaveAFK();
                    
                    const cancelledEmbed = new EmbedBuilder()
                        .setColor("#2ecc71")
                        .setDescription("✅ **AFK status cancelled and removed.**");

                    await i.update({ embeds: [cancelledEmbed], components: [] });
                    collector.stop();
                });

                return;
            }
                                                              
            // ==========================================                                                       
            // MODULE 3: CLEAR AFK ON MESSAGE
            // ==========================================
            const activeKey = afkData.has(serverKey) ? serverKey : (afkData.has(globalKey) ? globalKey : null);

            if (activeKey) {                 
                const data = afkData.get(activeKey);
                                                                  
                // 2 second safety window check                   
                if (Date.now() - data.setupAt > 2000) {
                    const duration = formatDuration(Date.now() - data.time);

                    afkData.delete(activeKey);
                    queueSaveAFK();                                                                                          
                    
                    const embed = new EmbedBuilder()                                                                        
                        .setColor("#2ecc71") // Green                                                                       
                        .setAuthor({
                            name: `Welcome back, ${displayName}!`,
                            iconURL: message.author.displayAvatarURL({ dynamic: true, extension: 'png' })                                                                     
                        })
                        .setDescription(`Your AFK status has been cleared.`)                                                
                        .addFields(
                            { name: "You were gone for", value: `\`${duration}\``, inline: true }
                        )
                        .setTimestamp();
                                                                      
                    return message.channel.send({ embeds: [embed] }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 8000);                                           
                    });                                           
                }                                             
            }
        } catch (error) {                                     
            console.error("AFK System Error:", error);
        }                                             
    });
};
