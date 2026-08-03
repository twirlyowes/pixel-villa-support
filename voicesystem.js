// Location: voicesystem.js
const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");
const db = require("./firebase");

// CONFIGURATION: Set to your Join-to-Create voice channel ID
const CREATE_CHANNEL_ID = "1522833037346214030";
const TARGET_CATEGORY_ID = "1531893602706526208"; // Optional: Put your temporary category ID here so it only sweeps this category!


// Active temporary channels tracker: Map<ChannelID, OwnerID>
const activeTempChannels = new Map();

// 2. Optimized VC Command Whitelist stored as a Set for O(1) lookups
const VALID_VC_COMMANDS = new Set([
  "vclock",
  "vcunlock",
  "vchide",
  "vcunhide",
  "vcname",
  "vclimit",
  "vcadd",
  "vcremove",
  "vckick",
  "vcp",
  "vcowner",
  "vcsync"
]);

// Helper functions for JSONBin API communication with robust error handling and retries
async function loadVoiceChannels() {
  const snapshot = await db.collection("voiceChannels").get();

  const channels = {};

  snapshot.forEach(doc => {
    channels[doc.id] = doc.data();
  });

  return { channels };
}

async function saveVoiceChannel(id, data) {
  await db.collection("voiceChannels")
    .doc(id)
    .set(data);
}

async function deleteVoiceChannel(id) {
  await db.collection("voiceChannels")
    .doc(id)
    .delete();
}
      

module.exports = (client) => {

  // 3. Safer startup cleanup: Only delete channels tracked in JSONBin storage
  client.once("ready", async () => {
    try {
      console.log(`[VoiceSystem] Bot logged in as ${client.user.tag}. Running startup sweep and restoration...`);
      const binData = await loadVoiceChannels();
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
            console.log(`[VoiceSystem] Cleaned up tracked empty temp channel on startup: ${targetChannel.name}`);  
          } else {  
            activeTempChannels.set(channelId, channelData.owner);  
            console.log(`[VoiceSystem] Restored ownership for channel ID ${channelId} -> Owner ID: ${channelData.owner}`);
          }  
        }  
      }  

      if (dataChanged) {  
        for (const [id, data] of Object.entries(binData.channels)) {
  await saveVoiceChannel(id, data);
        }
      }  
    } catch (err) {  
      console.error("Error during startup voice channel cleanup sweep & JSONBin sync:", err);  
    }
  });

  // 4. Optimized findTargetMember function with tiered search strategy
  async function findTargetMember(message, args) {
    // 1. Check Mention
    let targetMember = message.mentions.members.first();
    if (targetMember) return targetMember;

    if (args.length === 0) return null;  

    const query = args.join(" ").toLowerCase();  
      
    // 2. Check User ID
    const rawId = query.replace(/[<@!>]/g, "");  
    if (/^\d+$/.test(rawId)) {  
      const fetched = await message.guild.members.fetch(rawId).catch(() => null);  
      if (fetched) return fetched;  
    }  

    // 3. Search in cached members first
    let cachedMatch = message.guild.members.cache.find(m =>   
      m.user.username.toLowerCase().includes(query) ||  
      (m.user.globalName && m.user.globalName.toLowerCase().includes(query)) ||  
      (m.nickname && m.nickname.toLowerCase().includes(query))  
    );
    if (cachedMatch) return cachedMatch;

    // 4. Fallback: Full guild members fetch only as a last resort
    await message.guild.members.fetch().catch(() => {});  
    return message.guild.members.cache.find(m =>   
      m.user.username.toLowerCase().includes(query) ||  
      (m.user.globalName && m.user.globalName.toLowerCase().includes(query)) ||  
      (m.nickname && m.nickname.toLowerCase().includes(query))  
    );
  }

  // Track deletion actions to prevent duplicate deletion attempts
  const deletionTracker = new Set();

  // 1. Monitor Voice State Updates (Join to Create & Auto Delete)
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member || oldState.member;
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

        await saveVoiceChannel(tempChannel.id, {
  owner: member.id,
  createdAt: Date.now(),
  guildId: guild.id
});  

        const controlEmbed = new EmbedBuilder()
  .setColor("#5865F2")
  .setAuthor({
    name: "Pixel Villa Support • Voice System",
    iconURL: client.user.displayAvatarURL()
  })
  .setTitle("🎙️ Temporary Voice Control Panel")
  .setDescription(
`${member}, welcome to your private voice channel!

<:Shield_2:1532989398642327594> **Channel Owner**
> ${member}

<a:settings:1532990547394957393> **Manage your room using these commands:**
`
  )
  .addFields({
    name: "<a:sparkles:1532986077651140620> Voice Commands",
    value:
"`vclock` • Lock your room\n" +
"`vcunlock` • Unlock your room\n" +
"`vchide` • Hide your room\n" +
"`vcunhide` • Show your room\n" +
"`vcname [name]` • Rename channel\n" +
"`vclimit [number]` • Set user limit\n" +
"`vcadd @user` • Allow user\n" +
"`vcremove @user` • Remove user\n" +
"`vckick @user` • Kick user\n" +
"`vcowner @user` • Transfer ownership",
    inline: false
  })
  .setFooter({
    text: "Pixel Villa Support • Voice Management"
  })
  .setTimestamp();  

        await tempChannel.send({ content: `${member}`, embeds: [controlEmbed] });  

      } catch (error) {  
        console.error("Error creating temporary voice channel:", error);  
      }  
    }  

    // Check if someone left a channel (Reliable instant auto-delete)
if (oldState.channelId && oldState.channelId !== newState.channelId) {
  const channelId = oldState.channelId;

  if (
    channelId !== CREATE_CHANNEL_ID &&
    !deletionTracker.has(channelId)
  ) {
    deletionTracker.add(channelId);

    setTimeout(async () => {
      try {
        const leftChannel = await oldState.guild.channels.fetch(channelId).catch(() => null);

        if (
          !leftChannel ||
          leftChannel.type !== ChannelType.GuildVoice ||
          leftChannel.parentId !== TARGET_CATEGORY_ID
        ) {
          return;
        }

        // Re-check multiple times because Discord voice cache can lag
        let attempts = 0;
        while (attempts < 5) {
          const refreshedChannel = await oldState.guild.channels.fetch(channelId).catch(() => null);

          if (!refreshedChannel) return;

          if (refreshedChannel.members.size === 0) {
            break;
          }

          attempts++;

          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const finalChannel = await oldState.guild.channels.fetch(channelId).catch(() => null);

        if (!finalChannel || finalChannel.members.size > 0) {
          return;
        }

        await finalChannel.delete().catch(() => {});

        activeTempChannels.delete(channelId);

        await deleteVoiceChannel(channelId);

        console.log(`[VoiceSystem] Deleted empty temporary channel: ${channelId}`);

      } catch (err) {
        console.error("[VoiceSystem] Auto delete error:", err);
      } finally {
                deletionTracker.delete(channelId);
      }

        }, 500);
  }
} // closes oldState.channelId if
}); // closes voiceStateUpdate
  // 2. Handle Owner Customizations & Commands with Set Lookup & Early Ignoring
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();  
    const words = rawContent.split(/ +/);  
    const command = words[0].toLowerCase();  
    const args = words.slice(1);  

    // Check whitelist using Set.has() and ignore non-VC messages before logging or processing
    if (!VALID_VC_COMMANDS.has(command)) return;

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
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("<:lock:1532337641494937651> Voice channel has been **locked**.")] });  
    }  

    // UNLOCK COMMAND  
    if (command === "vcunlock") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { Connect: true });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("<:unlock:1532337553217294528> Voice channel has been **unlocked**.")] });  
    }  

    // HIDE COMMAND  
    if (command === "vchide") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: false });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("<:hide:1532336151854190743> Voice channel is now **hidden**.")] });  
    }  

    // UNHIDE COMMAND  
    if (command === "vcunhide") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      await memberChannel.permissionOverwrites.edit(message.guild.id, { ViewChannel: true });  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("<:unhide:1532336276164841482> Voice channel is now **visible**.")] });  
    }  

    // RENAME COMMAND  
    if (command === "vcname") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const newName = args.join(" ");  
      if (!newName) return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please provide a new name. (e.g., `vcname Chill Lounge`)")] });  
        
      await memberChannel.setName(newName);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`<:name:1532337141214871622> Channel renamed to **${newName}**.`)] });  
    }  

    // USER LIMIT COMMAND  
    if (command === "vclimit") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const limit = parseInt(args[0], 10);  
      if (isNaN(limit) || limit < 0 || limit > 99) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid limit between 0 and 99.")] });  
      }  

      await memberChannel.setUserLimit(limit);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`<:limit:1532340516249931826> User limit set to **${limit === 0 ? "Unlimited" : limit}**.`)] });  
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
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`<:add:1532337807765278801> Added **${targetMember.user.tag}** to your channel permissions.`)] });  
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
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`<:remove:1532337229907759124> Revoked channel permissions for **${targetMember.user.tag}**.`)] });  
    }  

    // KICK COMMAND  
    if (command === "vckick") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message, args);  

      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user who is currently inside your voice channel.")] });  
      }  

      await targetMember.voice.disconnect();  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`<:kick:1532337429426471044> Kicked **${targetMember.user.tag}** from your channel.`)] });  
    }  

    // 1. FIXED: TRANSFER OWNERSHIP COMMAND (`vcowner`) using .setDescription() instead of .setItem()
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

        await saveVoiceChannel(memberChannel.id, {
  owner: targetMember.id,
  updatedAt: Date.now()
});

        const successEmbed = new EmbedBuilder()  
          .setColor("Green")  
          .setDescription(`<:owner:1532337324762075146> Channel ownership has been successfully transferred to ${targetMember}!`);  

        return message.reply({ content: `${targetMember}`, embeds: [successEmbed] });  
      } catch (error) {  
        console.error("Error transferring ownership:", error);  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ An error occurred while transferring ownership.")] });  
      }  
    }
  });
};
