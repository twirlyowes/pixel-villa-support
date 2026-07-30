// Location: voicesystem.js
const {
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const axios = require("axios");

// ==========================================
// CONFIGURATION
// ==========================================
const CREATE_CHANNEL_ID = "1522833037346214030";
const TARGET_CATEGORY_ID = "1531893602706526208"; // Optional: Temporary category ID

// --- JSONBIN CONFIGURATION ---
const BIN_ID = "6a6b0441da38895dfea322da";
const API_KEY = "$2a$10$aCLB1kuqB51DVhDxNoqisureJ0zr51jUp6AyTnnci4YryQSiAKPwa";

// Active temporary channels tracker: Map<ChannelID, OwnerID>
const activeTempChannels = new Map();

// Optimized VC Command Whitelist stored as a Set for O(1) lookups
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

// ==========================================
// JSONBIN FUNCTIONS
// ==========================================
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

  // ==========================================
  // STARTUP CLEANUP
  // ==========================================
  client.once("ready", async () => {
    try {
      console.log(`[VoiceSystem] Bot logged in as ${client.user.tag}. Running startup sweep and restoration...`);
      const binData = await fetchJSONBin();
      if (!binData.channels) binData.channels = {};

      let dataChanged = false;  

      for (const guild of client.guilds.cache.values()) {  
        const channels = await guild.channels.fetch().catch(() => new Map());  

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
        await updateJSONBin(binData);  
      }  
    } catch (err) {  
      console.error("Error during startup voice channel cleanup sweep & JSONBin sync:", err);  
    }
  });

  // ==========================================
  // HELPER / MEMBER SEARCH SYSTEM
  // ==========================================
  async function findTargetMember(guild, queryInput) {
    if (!queryInput) return null;
    let query = queryInput.trim().toLowerCase();

    // 1. Check User ID or Mention
    const rawId = query.replace(/[<@!>]/g, "");  
    if (/^\d+$/.test(rawId)) {  
      const fetched = await guild.members.fetch(rawId).catch(() => null);  
      if (fetched) return fetched;  
    }  

    // 2. Search in cached members first
    let cachedMatch = guild.members.cache.find(m =>   
      m.user.username.toLowerCase() === query ||  
      (m.user.globalName && m.user.globalName.toLowerCase() === query) ||  
      (m.nickname && m.nickname.toLowerCase() === query) ||
      m.user.username.toLowerCase().includes(query) ||
      (m.nickname && m.nickname.toLowerCase().includes(query))
    );
    if (cachedMatch) return cachedMatch;

    // 3. Fallback: Full guild members fetch only as a last resort
    await guild.members.fetch().catch(() => {});  
    return guild.members.cache.find(m =>   
      m.user.username.toLowerCase().includes(query) ||  
      (m.user.globalName && m.user.globalName.toLowerCase().includes(query)) ||  
      (m.nickname && m.nickname.toLowerCase().includes(query))  
    );
  }

  // ==========================================
  // REUSABLE VOICE CONTROL FUNCTIONS
  // ==========================================
  async function lockVoice(channel) {
    await channel.permissionOverwrites.edit(channel.guild.id, { Connect: false });
  }

  async function unlockVoice(channel) {
    await channel.permissionOverwrites.edit(channel.guild.id, { Connect: true });
  }

  async function hideVoice(channel) {
    await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: false });
  }

  async function unhideVoice(channel) {
    await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: true });
  }

  async function renameVoice(channel, name) {
    await channel.setName(name);
  }

  async function limitVoice(channel, limit) {
    await channel.setUserLimit(limit);
  }

  async function addUser(channel, userMember) {
    await channel.permissionOverwrites.edit(userMember.id, { 
      Connect: true, 
      ViewChannel: true 
    });
  }

  async function removeUser(channel, userMember) {
    await channel.permissionOverwrites.delete(userMember.id).catch(() => {});
  }

  async function kickUser(channel, userMember) {
    if (userMember.voice.channelId === channel.id) {
      await userMember.voice.disconnect();
    }
  }

  async function transferOwner(channel, newOwnerMember) {
    const currentOwnerId = activeTempChannels.get(channel.id);
    
    // Demote current owner permissions
    if (currentOwnerId) {
      await channel.permissionOverwrites.edit(currentOwnerId, {  
        ManageChannels: false,  
        MoveMembers: false,  
        MuteMembers: false,  
        DeafenMembers: false  
      }).catch(() => {});  
    }

    // Promote new owner permissions
    await channel.permissionOverwrites.edit(newOwnerMember.id, {  
      Connect: true,  
      ViewChannel: true,  
      ManageChannels: true,  
      MoveMembers: true,  
      MuteMembers: true,  
      DeafenMembers: true  
    });  

    activeTempChannels.set(channel.id, newOwnerMember.id);  

    const binData = await fetchJSONBin();  
    if (binData.channels && binData.channels[channel.id]) {  
      binData.channels[channel.id].owner = newOwnerMember.id;  
      await updateJSONBin(binData);  
    }
  }

  // ==========================================
  // CONTROL PANEL UI BUILDER
  // ==========================================
  function getControlPanelComponents() {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vc_lock").setStyle(ButtonStyle.Secondary).setEmoji("1532337641494937651"),
      new ButtonBuilder().setCustomId("vc_unlock").setStyle(ButtonStyle.Secondary).setEmoji("1532337553217294528"),
      new ButtonBuilder().setCustomId("vc_hide").setStyle(ButtonStyle.Secondary).setEmoji("1532336151854190743"),
      new ButtonBuilder().setCustomId("vc_unhide").setStyle(ButtonStyle.Secondary).setEmoji("1532336276164841482"),
      new ButtonBuilder().setCustomId("vc_rename").setStyle(ButtonStyle.Primary).setEmoji("1532337141214871622")
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("vc_limit").setStyle(ButtonStyle.Primary).setEmoji("1532340516249931826"),
      new ButtonBuilder().setCustomId("vc_add").setStyle(ButtonStyle.Success).setEmoji("1532337807765278801"),
      new ButtonBuilder().setCustomId("vc_remove").setStyle(ButtonStyle.Danger).setEmoji("1532337229907759124"),
      new ButtonBuilder().setCustomId("vc_kick").setStyle(ButtonStyle.Danger).setEmoji("1532337429426471044"),
      new ButtonBuilder().setCustomId("vc_owner").setStyle(ButtonStyle.Primary).setEmoji("1532337324762075146")
    );

    return [row1, row2];
  }

  // ==========================================
  // VOICE CREATION SYSTEM & AUTO DELETE
  // ==========================================
  const deletionTracker = new Set();

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
          .setDescription(`Welcome to your private room, ${member}! You are the **owner** of this channel.\n\nManage your room via the control buttons below or use the chat commands (e.g. \`vcadd rukia\`):`)  
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

        await tempChannel.send({   
          content: `${member}`,   
          embeds: [controlEmbed],
          components: getControlPanelComponents()
        });  

      } catch (error) {  
        console.error("Error creating temporary voice channel:", error);  
      }  
    }  

    // Check if someone left a channel (Instant event-driven auto-delete if empty)  
    if (oldState.channelId && oldState.channelId !== newState.channelId) {  
      const leftChannel = oldState.channel;  
        
      if (  
        leftChannel &&   
        leftChannel.members.size === 0 &&   
        leftChannel.id !== CREATE_CHANNEL_ID &&  
        leftChannel.parentId === TARGET_CATEGORY_ID &&
        !deletionTracker.has(leftChannel.id)
      ) {  
        deletionTracker.add(leftChannel.id);
        try {  
          await leftChannel.delete().catch(() => {});  
            
          if (activeTempChannels.has(leftChannel.id)) {  
            activeTempChannels.delete(leftChannel.id);  
          }  

          const binData = await fetchJSONBin();  
          if (binData.channels && binData.channels[leftChannel.id]) {  
            delete binData.channels[leftChannel.id];  
            await updateJSONBin(binData);  
          }  
          console.log(`[VoiceSystem] Deleted empty temporary channel instantly: ${leftChannel.id}`);
        } catch (error) {  
          console.error("Error deleting empty temp channel:", error);  
        } finally {
          setTimeout(() => deletionTracker.delete(leftChannel.id), 10000);
        }
      }  
    }
  });

  // ==========================================
  // BUTTON INTERACTION HANDLER
  // ==========================================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || !interaction.guild) return;
    if (!interaction.customId.startsWith("vc_")) return;

    const memberChannel = interaction.member?.voice?.channel;
    if (!memberChannel || !activeTempChannels.has(memberChannel.id)) {
      return interaction.reply({ content: "❌ You must be inside your temporary voice channel to use these controls.", ephemeral: true });
    }

    const ownerId = activeTempChannels.get(memberChannel.id);
    const isOwner = ownerId === interaction.user.id;
    const notOwnerText = "❌ Only the owner can use these controls.";

    if (!isOwner) {
      return interaction.reply({ content: notOwnerText, ephemeral: true });
    }

    // Handle Direct Action Buttons
    if (interaction.customId === "vc_lock") {
      await lockVoice(memberChannel);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔒 Voice channel has been **locked**.🥚")], ephemeral: true });
    }
    if (interaction.customId === "vc_unlock") {
      await unlockVoice(memberChannel);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🔓 Voice channel has been **unlocked**.")] , ephemeral: true});
    }
    if (interaction.customId === "vc_hide") {
      await hideVoice(memberChannel);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("🙈 Voice channel is now **hidden**.")] , ephemeral: true});
    }
    if (interaction.customId === "vc_unhide") {
      await unhideVoice(memberChannel);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription("👁️ Voice channel is now **visible**.")] , ephemeral: true});
    }

    // Handle Modal Triggers
    if (interaction.customId === "vc_rename") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_rename")
        .setTitle("Rename Voice Channel")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_channel_name")
              .setLabel("New Channel Name")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          )
        );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "vc_limit") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_limit")
        .setTitle("Set User Limit")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_user_limit")
              .setLabel("Limit number (0-99)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(2)
          )
        );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "vc_add") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_add")
        .setTitle("Add User to Voice Channel")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_target_user")
              .setLabel("User name or ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "vc_remove") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_remove")
        .setTitle("Remove User Permissions")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_target_user")
              .setLabel("User name or ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "vc_kick") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_kick")
        .setTitle("Kick User From Channel")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_target_user")
              .setLabel("User name or ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "vc_owner") {
      const modal = new ModalBuilder()
        .setCustomId("modal_vc_owner")
        .setTitle("Transfer Ownership")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("input_target_user")
              .setLabel("User name or ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return await interaction.showModal(modal);
    }
  });

  // ==========================================
  // MODAL INTERACTION HANDLER
  // ==========================================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isModalSubmit() || !interaction.guild) return;
    if (!interaction.customId.startsWith("modal_vc_")) return;

    const memberChannel = interaction.member?.voice?.channel;
    if (!memberChannel || !activeTempChannels.has(memberChannel.id)) {
      return interaction.reply({ content: "❌ You must be inside your temporary voice channel.", ephemeral: true });
    }

    const ownerId = activeTempChannels.get(memberChannel.id);
    if (ownerId !== interaction.user.id) {
      return interaction.reply({ content: "❌ Only the owner can use these controls.", ephemeral: true });
    }

    if (interaction.customId === "modal_vc_rename") {
      const newName = interaction.fields.getTextInputValue("input_channel_name");
      await renameVoice(memberChannel, newName);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✏️ Channel renamed to **${newName}**.`)] , ephemeral: true});
    }

    if (interaction.customId === "modal_vc_limit") {
      const limitVal = parseInt(interaction.fields.getTextInputValue("input_user_limit"), 10);
      if (isNaN(limitVal) || limitVal < 0 || limitVal > 99) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid limit between 0 and 99.")], ephemeral: true });
      }
      await limitVoice(memberChannel, limitVal);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👥 User limit set to **${limitVal === 0 ? "Unlimited" : limitVal}**.`)] , ephemeral: true});
    }

    if (interaction.customId === "modal_vc_add") {
      const query = interaction.fields.getTextInputValue("input_target_user");
      targetMember);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✅ Added **${targetMember.user.tag}** to your channel permissions.`)] });  
    }  

    // REMOVE COMMAND  
    if (command === "vcremove") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message.guild, args.join(" "));  
      if (!targetMember) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user name or mention to remove from your channel permissions.")] });  
      }  
      if (targetMember.id === ownerId) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("❌ You cannot remove permissions for yourself.")] });  
      }  
      await removeUser(memberChannel, targetMember);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`❌ Revoked channel permissions for **${targetMember.user.tag}**.`)] });  
    }  

    // KICK COMMAND  
    if (command === "vckick") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message.guild, args.join(" "));  
      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user who is currently inside your voice channel.")] });  
      }  
      await kickUser(memberChannel, targetMember);  
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👢 Kicked **${targetMember.user.tag}** from your channel.`)] });  
    }  

    // TRANSFER OWNERSHIP COMMAND  
    if (command === "vcowner") {  
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });  
      const targetMember = await findTargetMember(message.guild, args.join(" "));  
      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid user who is currently inside your voice channel.")] });  
      }  
      if (targetMember.id === ownerId) {  
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ You are already the owner of this channel.")] });  
      }  
      try {  
        await transferOwner(memberChannel, targetMember);  
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
