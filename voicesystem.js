// Location: voicesystem.js
const { 
  ChannelType, 
  PermissionsBitField, 
  EmbedBuilder 
} = require("discord.js");

// CONFIGURATION: Set to your Join-to-Create voice channel ID
const CREATE_CHANNEL_ID = "1522833037346214030"; 
const TARGET_CATEGORY_ID = ""; // Optional: Category ID where temp VCs are created

// Active temporary channels tracker: Map<ChannelID, OwnerID>
const activeTempChannels = new Map();

// Cooldown tracker to prevent rapid spam tripping security bots
const creationCooldowns = new Map();

module.exports = (client) => {

  // 1. Monitor Voice State Updates (Join to Create & Auto Delete)
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // User joined the "Join to Create" channel
    if (newState.channelId === CREATE_CHANNEL_ID) {
      // Basic rate limiting check (prevents rapid creation spam triggers)
      const lastCreated = creationCooldowns.get(member.id) || 0;
      const now = Date.now();
      if (now - lastCreated < 7000) { // 7 seconds cooldown per user
        try { await member.voice.setChannel(null); } catch (e) {}
        return;
      }
      creationCooldowns.set(member.id, now);

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
                PermissionsBitField.Flags.MoveMembers,
                PermissionsBitField.Flags.ViewChannel
              ],
            },
          ],
        });

        // Move user into their newly created channel
        await member.voice.setChannel(tempChannel);
        activeTempChannels.set(tempChannel.id, member.id);

        // Send Welcome Embed with Command List inside the new channel (if text-in-voice or general setup allows messaging)
        const controlEmbed = new EmbedBuilder()
          .setColor("#5865F2")
          .setTitle("🎙️ Temporary Voice Control Panel")
          .setDescription(`Welcome to your private room, ${member}! You are the **owner** of this channel.\n\nUse the commands below directly in chat to manage your room:`)
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
              "`vcadd @user` - Allow/add a user to your room\n" +
              "`vckick @user` - Kick a user from your room",
              inline: false
            }
          )
          .setFooter({ text: "Pixel Villa Voice Master System" })
          .setTimestamp();

        // Send message to the channel (Discord voice channels support text-in-voice)
        await tempChannel.send({ content: `${member}`, embeds: [controlEmbed] });

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

  // 2. Handle Owner Customizations & Commands
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

    // ADD / PERMIT COMMAND (`vcadd @user`)
    if (command === "vcadd") {
      if (!isOwner) return message.reply({ embeds: [notOwnerEmbed] });
      const targetMember = message.mentions.members.first();
      if (!targetMember) {
        return message.reply({ embeds: [new EmbedBuilder().setColor("Red").setDescription("⚠️ Please mention a valid user to add to your channel.")] });
      }

      await memberChannel.permissionOverwrites.edit(targetMember.id, { 
        Connect: true, 
        ViewChannel: true 
      });
      return message.reply({ embeds: [new EmbedBuilder().setColor("Green").setDescription(`✅ Added **${targetMember.user.tag}** to your channel permissions.`)] });
    }

    // KICK COMMAND
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
