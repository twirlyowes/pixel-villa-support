// Location: voicesystem.js
const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");
const axios = require("axios");

// CONFIGURATION: Set to your Join-to-Create voice channel ID
const CREATE_CHANNEL_ID = "1522833037346214030";
const TARGET_CATEGORY_ID = "1531893602706526208"; // Optional: Put your temporary category ID here so it only sweeps this category!

// --- JSONBIN CONFIGURATION ---
const BIN_ID = "6a69f2dbf5f4af5e29d1274e";
const API_KEY = "";

// Active temporary channels tracker: Map<ChannelID, OwnerID>
const activeTempChannels = new Map();

// Helper functions for JSONBin API communication with robust error handling and retries
async function fetchJSONBin(retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
        headers: { 
          "X-Master-Key": API_KEY 
        },
        timeout: 10000
      });
      return response.data.record || { channels: {} };
    } catch (error) {
      console.warn(`[JSONBin] Attempt ${attempt} failed fetching data: ${error.message}`);
      if (attempt === retries) {
        console.error("[JSONBin] All retry attempts failed for fetch. Returning fallback cache structure.");
        return { channels: {} };
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
  return { channels: {} };
}

async function updateJSONBin(data, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await axios.put(`https://api.jsonbin.io/v3/b/${BIN_ID}`, data, {
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": API_KEY
        },
        timeout: 10000
      });
      console.log("[JSONBin] Successfully synced data storage.");
      return;
    } catch (error) {
      console.warn(`[JSONBin] Attempt ${attempt} failed updating data: ${error.message}`);
      if (attempt === retries) {
        console.error("[JSONBin] All retry attempts failed for update. Changes kept locally.");
        return;
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

module.exports = (client) => {

  // Startup safety check & JSONBin persistent channel restoration + Periodic Cleanup Interval
  client.once("ready", async () => {
    try {
      console.log(`[VoiceSystem] Bot logged in as ${client.user.tag}. Running startup sweep and restoration...`);
      const binData = await fetchJSONBin();
      if (!binData.channels) binData.channels = {};

      let dataChanged = false;  

      for (const guild of client.guilds.cache.values()) {  
        const channels = await guild.channels.fetch().catch(() => new Map());  

        // Restore active temporary channels from JSONBin into Map with thorough checks  
        for (const [channelId, channelData] of Object.entries(binData.channels)) {  
          const targetChannel = channels.get(channelId);  

          if (!targetChannel || targetChannel.type !== ChannelType.GuildVoice) {  
            delete binData.channels[channelId];  
            dataChanged = true;  
            console.log(`[VoiceSystem] Removed non-existent channel from JSONBin record: ${channelId}`);
          } else if (targetChannel.members.size === 0) {  
            await targetChannel.delete().catch(() => {});  
            delete binData.channels[channelId];  
            dataChanged = true;  
            console.log(`[VoiceSystem] Cleaned up orphaned empty temp channel on startup: ${targetChannel.name}`);  
          } else {  
            activeTempChannels.set(channelId, channelData.owner);  
            console.log(`[VoiceSystem] Restored ownership for channel ID ${channelId} -> Owner ID: ${channelData.owner}`);
          }  
        }  

        // Sweep unmapped empty channels in target category  
        for (const channel of channels.values()) {  
          if (channel.type === ChannelType.GuildVoice && channel.id !== CREATE_CHANNEL_ID) {  
            if (TARGET_CATEGORY_ID && channel.parentId === TARGET_CATEGORY_ID && channel.members.size === 0) {  
              await channel.delete().catch(() => {});  
              if (binData.channels[channel.id]) {  
                delete binData.channels[channel.id];  
                dataChanged = true;  
              }  
              console.log(`[VoiceSystem] Cleaned up unmapped empty temp channel: ${channel.name}`);  
            }  
          }  
        }  
      }  

      if (dataChanged) {  
        await updateJSONBin(binData);  
      }  
    } catch (err) {  
      console.error("Error during startup voice channel cleanup sweep & JSONBin sync:", err);  
    }

    // Periodic Background Cleanup Sweep (runs every 5 minutes to prevent long-running drift)
    setInterval(async () => {
      try {
        console.log("[VoiceSystem] Running periodic background cleanup sweep...");
        const binData = await fetchJSONBin();
        if (!binData.channels) return;

        let periodicChanges = false;
        for (const [channelId, channelData] of Object.entries(binData.channels)) {
          for (const guild of client.guilds.cache.values()) {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || channel.members.size === 0) {
              if (channel) {
                await channel.delete().catch(() => {});
              }
              delete binData.channels[channelId];
              activeTempChannels.delete(channelId);
              periodicChanges = true;
              console.log(`[VoiceSystem] Periodic sweep removed empty/dead channel: ${channelId}`);
            }
          }
        }

        if (periodicChanges) {
          await updateJSONBin(binData);
        }
      } catch (periodicErr) {
        console.error("[VoiceSystem] Error in periodic background cleanup sweep:", periodicErr);
      }
    }, 5 * 60 * 1000);
  });

  // Helper function for smart user search (Mentions, User IDs, Usernames, or Nicknames)
  async function findTargetMember(message, args) {
    let targetMember = message.mentions.members.first();
    if (targetMember) return targetMember;

    if (args.length === 0) return null;  

    const query = args.join(" ").toLowerCase();  
      
    const rawId = query.replace(/[<@!>]/g, "");  
    if (/^\d+$/.test(rawId)) {  
      const fetched = await message.guild.members.fetch(rawId).catch(() => null);  
      if (fetched) return fetched;  
    }  

    await message.guild.members.fetch().catch(() => {});  
    return message.guild.members.cache.find(m =>   
      m.user.username.toLowerCase().includes(query) ||  
      (m.user.globalName && m.user.globalName.toLowerCase().includes(query)) ||  
      (m.nickname && m.nickname.toLowerCase().includes(query))  
    );
  }

  // 1. Monitor Voice State Updates (Join to Create & Auto Delete)
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // User joined the "Join to Create" channel  
    if (newState.channelId === CREATE_CHANNEL_ID) {  
      try {  
        const guild = newState.guild;  
        const displayName = member.displayName || member.user.username;  
        const channelName = `${displayName}'s Room`;  

        let categoryOverwrites = [];  
        if (TARGET_CATEGORY_ID) {  
          const categoryChannel = await guild.channels.fetch(TARGET_CATEGORY_ID).catch(() => null);  
          if (categoryChannel && categoryChannel.type === ChannelType.GuildCategory) {  
            categoryOverwrites = categoryChannel.permissionOverwrites.cache.map(overwrite => ({  
              id: overwrite.id,  
              type: overwrite.type,  
              allow: overwrite.allow,  
              deny: overwrite.deny,  
            }));  
          }  
        }  

        const ownerOverwrite = {  
          id: member.id,  
          allow: [  
            PermissionsBitField.Flags.Connect,  
            PermissionsBitField.Flags.ManageChannels,  
            PermissionsBitField.Flags.MuteMembers,  
            PermissionsBitField.Flags.DeafenMembers,  
            PermissionsBitField.Flags.MoveMembers,  
            PermissionsBitField.Flags.ViewChannel  
          ],  
        };  

        const existingOwnerIndex = categoryOverwrites.findIndex(o => o.id === member.id);  
        if (existingOwnerIndex !== -1) {  
          const existing = categoryOverwrites[existingOwnerIndex];  
          const combinedAllow = new PermissionsBitField(existing.allow).add(ownerOverwrite.allow);  
          categoryOverwrites[existingOwnerIndex].allow = combinedAllow;  
        } else {  
          categoryOverwrites.push(ownerOverwrite);  
        }  

        const tempChannel = await guild.channels.create({  
          name: channelName,  
          type: ChannelType.GuildVoice,  
          parent: TARGET_CATEGORY_ID || newState.channel?.parentId || null,  
          permissionOverwrites: categoryOverwrites,  
        });  

        await member.voice.setChannel(tempChannel);  
          
        activeTempChannels.set(tempChannel.id, member.id);  
        console.log(`[VoiceSystem] Created new temp channel: ${tempChannel.name} (${tempChannel.id}) for owner: ${member.user.tag}`);

        const binData = await fetchJSONBin();  
        if (!binData.channels) binData.channels = {};  
        binData.channels[tempChannel.id] = {  
          owner: member.id,  
          createdAt: Date.now()  
        };  
        await updateJSONBin(binData);  

        const controlEmbed = new EmbedBuilder()  
          .setColor("#5865F2")  
          .setTitle("🎙️ Temporary Voice Control Panel")  
          .setDescription(`Welcome to your private room, ${member}! You are the **owner** of this channel.\n\nUse the commands below directly in chat to manage your room (Supports both mentions and name searches like \`vcadd rukia\`):`)  
          .addFields(  
            {  
              name: "Available Voice Commands",  
              value:  
              "`vclock` - Lock your room\n" +  
              "`vcunlock` - Unlock your room\n" +  
              "`vchide` - Hide your room\n" +  
              "`vcunhide` - Make your room visible\n" +  
              "`vcname [name]` - Rename your room\n" +  
              "`vclimit [number]` - Set user limit (0-99)\n" +  
              "`vcadd @user/name` - Allow/add a user to your room\n" +  
              "`vcremove @user/name` - Remove/revoke user access from your room\n" +  
              "`vckick @user/name` - Kick a user from your room\n" +  
              "`vcowner @user/name` - Transfer channel ownership",  
              inline: false  
            }  
          )  
          .setFooter({ text: "Pixel Villa Voice Master System" })  
          .setTimestamp();  

        await tempChannel.send({ content: `${member}`, embeds: [controlEmbed] });  

      } catch (error) {  
        console.error("Error creating temporary voice channel:", error);  
      }  
    }  

    // Check if someone left a channel (Auto-delete with a 3-second delay if empty)  
    if (oldState.channelId) {  
      const leftChannel = oldState.channel;  
        
      if (  
        leftChannel &&   
        leftChannel.members.size === 0 &&   
        leftChannel.id !== CREATE_CHANNEL_ID &&  
        leftChannel.parentId === TARGET_CATEGORY_ID  
      ) {  
        setTimeout(async () => {  
          try {  
            const fetchedChannel = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);  
            if (fetchedChannel && fetchedChannel.members.size === 0) {  
              await fetchedChannel.delete().catch(() => {});  
                
              if (activeTempChannels.has(oldState.channelId)) {  
                activeTempChannels.delete(oldState.channelId);  
              }  

              const binData = await fetchJSONBin();  
              if (binData.channels && binData.channels[oldState.channelId]) {  
                delete binData.channels[oldState.channelId];  
                await updateJSONBin(binData);  
              }  
              console.log(`[VoiceSystem] Deleted empty temporary channel after delay: ${oldState.channelId}`);
            }  
          } catch (error) {  
            console.error("Error deleting empty temp channel after delay:", error);  
          }  
        }, 3000);  
      }  
    }
  });

  // 2. Handle Owner Customizations & Commands
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();  
    const words = rawContent.split(/ +/);  
    const command = words[0].toLowerCase();  
    const args = words.slice(1);  

    const memberChannel = message.member?.voice?.channel;  
    if (!memberChannel || !activeTempChannels.has(memberChannel.id)) return;  

    const ownerId = activeTempChannels.get(memberChannel.id);  
    const isOwner = ownerId === message.author.id;  

    console.log(`[VoiceSystem Command] Command detected: ${command} by user ${message.author.tag} in channel ${memberChannel.name} (Is Owner: ${isOwner})`);

    const notOwnerEmbed = new EmbedBuilder()  
      .setColor("Red")  
      .setDescription("❌ Only the **owner** of this temporary voice channel can use these controls.");  

    // LOCK COMMAND  
    if (command === "vclock") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { Connect: false });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔒 Voice channel has been **locked**.")] });  
    }  

    // UNLOCK COMMAND  
    if (command === "vcunlock") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { Connect: true });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔓 Voice channel has been **unlocked**.")] });  
    }  

    // HIDE COMMAND  
    if (command === "vchide") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🙈 Voice channel is now **hidden**.")] });  
    }  

    // UNHIDE COMMAND  
    if (command === "vcunhide") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("👁️ Voice channel is now **visible**.")] });  
    }  

    // RENAME COMMAND  
    if (command === "vcname") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const newName = args.join(" ");  
      if (!newName) return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please provide a new name. (e.g., `vcname Chill Lounge`)")] });  
        
      await memberChannel.setName(newName);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✏️ Channel renamed to **${newName}**.`)] });  
    }  

    // USER LIMIT COMMAND  
    if (command === "vclimit") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const limit = parseInt(args[0], 10);  
      if (isNaN(limit) || limit < 0 || limit > 99) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid limit between 0 and 99.")] });  
      }  

      await memberChannel.setUserLimit(limit);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👥 User limit set to **${limit === 0 ? "Unlimited" : limit}**.`)] });  
    }  

    // ADD / PERMIT COMMAND  
    if (command === "vcadd") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message, args);  
        
      if (!targetMember) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user name or mention to add to your channel.")] });  
      }  

      await memberChannel.permissionOverwrites.edit(targetMember.id, {   
        Connect: true,   
        ViewChannel: true   
      });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✅ Added **${targetMember.user.tag}** to your channel permissions.`)] });  
    }  

    // REMOVE / REVOKE COMMAND  
    if (command === "vcremove") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message, args);  

      if (!targetMember) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user name or mention to remove from your channel permissions.")] });  
      }  

      if (targetMember.id === ownerId) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You cannot remove permissions for yourself.")] });  
      }  

      await memberChannel.permissionOverwrites.delete(targetMember.id).catch(() => {});  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`❌ Revoked channel permissions for **${targetMember.user.tag}**.`)] });  
    }  

    // KICK COMMAND  
    if (command === "vckick") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message, args);  

      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user who is currently inside your voice channel.")] });  
      }  

      await targetMember.voice.disconnect();  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👢 Kicked **${targetMember.user.tag}** from your channel.`)] });  
    }  

    // TRANSFER OWNERSHIP COMMAND (`vcowner`)  
    if (command === "vcowner") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message, args);  

      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user who is currently inside your voice channel.")] });  
      }  

      if (targetMember.id === ownerId) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ You are already the owner of this channel.")] });  
      }  

      try {  
        await memberChannel.permissionOverwrites.edit(ownerId, {  
          ManageChannels: false,  
          MoveMembers: false,  
          MuteMembers: false,  
          DeafenMembers: false  
        }).catch(() => {});  

        await memberChannel.permissionOverwrites.edit(targetMember.id, {  
          Connect: true,  
          ViewChannel: true,  
          ManageChannels: true,  
          MoveMembers: true,  
          MuteMembers: true,  
          DeafenMembers: true  
        });  

        activeTempChannels.set(memberChannel.id, targetMember.id);  
        console.log(`[VoiceSystem Ownership] Transferred ownership of channel ${memberChannel.id} to new owner ID: ${targetMember.id}`);

        const binData = await fetchJSONBin();  
        if (binData.channels && binData.channels[memberChannel.id]) {  
          binData.channels[memberChannel.id].owner = targetMember.id;  
          await updateJSONBin(binData);  
        }  

        const successEmbed = new EmbedBuilder()  
          .setColor("Green")  
          .setDescription(`👑 Channel ownership has been successfully transferred to ${targetMember}!`);  

        return message.reply({ content: `${targetMember}`, embeds: [successEmbed] });  
      } catch (error) {  
        console.error("Error transferring ownership:", error);  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ An error occurred while transferring ownership.")] });  
      }  
    }
  });
};
