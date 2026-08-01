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
        if (user.id === message.author.id) return; // Ignore self mentions

        const data = afkData.get(user.id);

        if (data) {
            mentions.push(
`<a:Moon:1532988257338527835> **${user.username} is currently AFK**

<a:LP_Message:1532991009066324049> **Reason**
> ${data.reason}

<a:Clock:1532990759371018372> **Away Since**
> ${formatTime(data.time)}`
            );
        }
    });

    if (mentions.length > 0) {
        const embed = new EmbedBuilder()
            .setColor("#F1C40F")
            .setAuthor({
                name: "Pixel Villa Support • AFK",
                iconURL: client.user.displayAvatarURL()
            })
            .setDescription(
`${mentions.join("\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n")}

━━━━━━━━━━━━━━━━━━━━━━

<a:sparkles:1532986077651140620> They will be notified that you mentioned them once they return.`
            )
            .setFooter({
                text: "Pixel Villa Support • AFK Module"
            })
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
        .setColor("#F1C40F")
        .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setDescription(
`<a:Moon:1532988257338527835> **AFK Enabled**

━━━━━━━━━━━━━━━━━━━━━━

Your AFK status has been enabled successfully.

<a:LP_Message:1532991009066324049> **Reason**
> ${reason}

<a:Clock:1532990759371018372> **Started**
> ${formatTime(time)}

━━━━━━━━━━━━━━━━━━━━━━

<a:sparkles:1532986077651140620> Anyone who mentions you will automatically receive your AFK status until you send another message.`
        )
        .setFooter({
            text: "Pixel Villa Support • AFK Module"
        })
        .setTimestamp();

    return message.channel.send({
        embeds: [embed]
    });
           }
                                                              
            // ==========================================                                                       
            // MODULE 3: CLEAR AFK ON MESSAGE
            // ==========================================
            if (afkData.has(message.author.id)) {
    const data = afkData.get(message.author.id);

    // 2 second safety window
    if (Date.now() - data.setupAt > 2000) {
        const duration = formatDuration(Date.now() - data.time);

        afkData.delete(message.author.id);
        await saveAFK();

        const embed = new EmbedBuilder()
            .setColor("#57F287")
            .setAuthor({
                name: message.author.username,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setDescription(
`<a:back:1532987608542744847> **Welcome Back!**

━━━━━━━━━━━━━━━━━━━━━━

Your AFK status has been removed successfully.

<a:Clock:1532990759371018372> **Time Away**
> ${duration}

━━━━━━━━━━━━━━━━━━━━━━

<a:success:1532986625343099050> Welcome back to **Pixel Villa Support**. Hope you had a great break!`
            )
            .setFooter({
                text: "Pixel Villa Support • AFK Module"
            })
            .setTimestamp();

       
        } catch (error) {                                     
            console.error("AFK System Error:", error);
        }                                             
    });
};
