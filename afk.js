const { EmbedBuilder } = require("discord.js");
const fs = require("fs");                         
const path = require("path");
const afkFile = path.join(__dirname, "afk.json"); 
let afkData = new Map();                                                                            

function loadAFK() {
    try {
        if (!fs.existsSync(afkFile)) {
            fs.writeFileSync(afkFile, "{}", "utf8");
            return;                                       
        }
        const raw = fs.readFileSync(afkFile, "utf8");                                                       
        const parsed = JSON.parse(raw || "{}");
        afkData = new Map(Object.entries(parsed));    
    } catch (error) {                                     
        console.error("Failed to load AFK database:", error);
    }                                             
}

function saveAFK() {                                  
    try {                                                 
        const obj = Object.fromEntries(afkData);
        fs.writeFileSync(afkFile, JSON.stringify(obj, null, 4), "utf8");
    } catch (error) {                                     
        console.error("Failed to save AFK database:", error);
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
                saveAFK();

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
                    saveAFK();                                                                                          
                    
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
