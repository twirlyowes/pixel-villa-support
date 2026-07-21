const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'rps',
  description: 'Play a game of Rock-Paper-Scissors!',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Rock, Paper, Scissors')
      .setDescription('Choose your weapon below!')
      .setColor('#0099ff');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock 🪨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper 📄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors ✂️').setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });

    const filter = i => i.user.id === message.author.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[Math.floor(Math.random() * choices.length)];
      const userChoice = i.customId.split('_')[1];

      let resultText = '';
      if (userChoice === botChoice) {
        resultText = `It's a tie! We both chose **${botChoice}**.`;
      } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) {
        resultText = `🎉 You win! You chose **${userChoice}** and I chose **${botChoice}**.`;
      } else {
        resultText = `🤖 I win! I chose **${botChoice}** and you chose **${userChoice}**.`;
      }

      const finalEmbed = new EmbedBuilder()
        .setTitle('Rock, Paper, Scissors - Results')
        .setDescription(resultText)
        .setColor('#00ff00');

      await i.update({ embeds: [finalEmbed], components: [] });
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        msg.edit({ content: 'Game timed out!', components: [] }).catch(() => {});
      }
    });
  }
};
