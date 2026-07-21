const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'rps',
  description: 'Play Rock Paper Scissors',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Rock Paper Scissors')
      .setDescription('Choose your weapon!');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock 🪨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper 📄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors ✂️').setStyle(ButtonStyle.Primary)
    );

    return message.channel.send({ embeds: [embed], components: [row] });
  }
};
