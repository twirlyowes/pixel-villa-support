// Location: afk.js
const { EmbedBuilder } = require("discord.js");

// --- JSONBIN CONFIGURATION FOR AFK ---
const BIN_ID = "6a61ad17da38895dfe82b608";
const API_KEY = "$2a$10$aCLBlkuqB51DVhDxNoqisureJOzr5ljUp6AyTncij4YryQSiAKPwa";
// -------------------------------------

let afkData = new Map();                                                                            

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

async function saveAFK() {                                  
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

            // ==========================================                                                       
            // MODULE 1: CHECK MENTIONS FIRST                 
            // ==========================================                                                       
            if (message.mentions.users.size > 0) {
                const mentions = [];

                message.mentions.users.forEach(user => {                                                                
                    if (user.id === message.author.id) return; // Ignore self pings                 
                    const data = afkData.get(user.id);
                    if (data) {
                        mentions.push(                                        
                            `**${user.username}** is currently away:\n` +
                            `Reason: ${data.reason}\n` +
                            `Since: ${formatTime(data.time)}`
                        );
                    }
                });
                                                                  
                if (mentions.length > 0) {
                    const embed = new EmbedBuilder()
                        .setColor("#e67e22") // Warm Orange
                        .setTitle("Status: Away")
                        .setDescription(mentions.join("\n\n"))                                                              
                        .setTimestamp();          
                    
                    return message.channel.send({
                        embeds: [embed]
                    });                                           
                }
            }                                                                                                   
            
            // ==========================================
            // MODULE 2: SET AFK STATUS
            // ==========================================
            if (lowerContent.startsWith("afk")) {                 
                const reason = content.slice(3).trim() || "No reason provided";                                     
                const time = Date.now();

                afkData.set(message.author.id, {
                    reason,
                    time,                                             
                    setupAt: time
                });                                               
                await saveAFK();

                const embed = new EmbedBuilder()
                    .setColor("#f1c40f") // Yellow                    
                    .setAuthor({
                        name: `${message.author.username} is now AFK`,                                                      
                        iconURL: message.author.displayAvatarURL({ dynamic: true, extension: 'png' })
                    })                                                
                    .setDescription(`Status updated successfully.`)
                    .addFields(
                        { name: "Reason", value: `\`\`\`${reason}\`\`\``, inline: false },                                  
                        { name: "Set At", value: formatTime(time), inline: false }
                    )
                    .setFooter({ text: "I will notify users who mention you." })
                    .setTimestamp();

                return message.channel.send({ embeds: [embed] });
            }
                                                              
            // ==========================================                                                       
            // MODULE 3: CLEAR AFK ON MESSAGE
            // ==========================================
            if (afkData.has(message.author.id)) {                 
                const data = afkData.get(message.author.id);
                                                                  
                // 2 second safety window check                   
                if (Date.now() - data.setupAt > 2000) {
                    const duration = formatDuration(Date.now() - data.time);

                    afkData.delete(message.author.id);
                    await saveAFK();                                                                                          
                    
                    const embed = new EmbedBuilder()                                                                        
                        .setColor("#2ecc71") // Green                                                                       
                        .setAuthor({
                            name: `Welcome back, ${message.author.username}!`,
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
