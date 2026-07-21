// Location: voicesystem.js
const { 
  ChannelType, 
  PermissionsBitField, 
  EmbedBuilder 
} = require("discord.js");

// CONFIGURATION: Set to your Join-to-Create voice channel ID
const CREATE_CHANNEL_ID = "1522833037346214030"; 
const TARGET_CATEGORY_ID = ""; // Optional: Category ID where temp VCs are created (leave empty to use the same category)

// Active temporary channels tracker: Map<ChannelID, OwnerID>
const activeTempChannels = new Map();

module.exports = (client) => {

  // 1. Monitor Voice State Updates (Join to Create & Auto Delete)
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // User joined the "Join to Create" channel
    if (newState.channelId === CREATE_CHANNEL_ID) {
      try {
        const guild = newState.guild;
        const channelName = `${member.user.username}'s Room`;

        // Create the temporary voice channel
        const tempChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: TARGET_CATEGORY_ID || newState.channel?.parentId || null,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MuteMembers,
                PermissionsBitField.Flags.DeafenMembers,
                PermissionsBitField.Flags.MoveMembers
              ],
            },
          ],
        });

        // Move user into their newly created channel
        await member.voice.setChannel(tempChannel);
        activeTempChannels.set(tempChannel.id, member.id);

      } catch (error) {
        console.error("Error creating temporary voice channel:", error);
      }
    }

    // Check if someone left a temporary channel (Auto-delete if empty)
    if (oldState.channelId && activeTempChannels.has(oldState.channelId)) {
      const leftChannel = oldState.channel;
      if (leftChannel && leftChannel.members.size === 0) {
        try {
          await leftChannel.delete();
          activeTempChannels.delete(oldState.channelId);
        } catch (error) {
          console.error("Error deleting empty temp channel:", error);
        }
      }
    }
  });

  // 2. Handle Owner Customizations via Prefix-less Commands
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const rawContent = message.content.trim();
    const words = rawContent.split(/ +/);
    const command = words[0].toLowerCase();
    const args = words.slice(1);

    // Check if the user is currently in a temp channel and is the owner
    const memberChannel = message.member.voice.channel;
    if (!memberChannel || !activeTempChannels.has(memberChannel.id)) return;

    const ownerId = activeTempChannels.get(memberChannel.id);
    const isOwner = ownerId === message.author.id;

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

    // RENAME COMMAND (vcname Room Name)
    if (command === "vcname") {
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });
      const newName = args.join(" ");
      if (!newName) return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please provide a new name. (e.g., `vcname Chill Lounge`)")] });
      
      await memberChannel.setName(newName);
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✏️ Channel renamed to **${newName}**.`)] });
    }

    // USER LIMIT COMMAND (vclimit 3)
    if (command === "vclimit") {
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });
      const limit = parseInt(args[0], 10);
      if (isNaN(limit) || limit < 0 || limit > 99) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please specify a valid limit between 0 and 99.")] });
      }

      await memberChannel.setUserLimit(limit);
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👥 User limit set to **${limit === 0 ? "Unlimited" : limit}**.`)] });
    }

    // KICK COMMAND (vckick @user)
    if (command === "vckick") {
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });
      const targetMember = message.mentions.members.first();
      if (!targetMember || targetMember.voice.channelId !== memberChannel.id) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please mention a user who is currently inside your voice channel.")] });
      }

      await targetMember.voice.disconnect();
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`👢 Kicked **${targetMember.user.tag}** from your channel.`)] });
    }
  });
};
