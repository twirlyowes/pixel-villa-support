const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ttt',
  description: 'Play Tic-Tac-Toe',
  async execute(message) {
    const board = Array(9).pad(null);
    let currentPlayer = message.author;
    let opponent = null;

    const getRow = (r) => {
      return new ActionRowBuilder().addComponents(
        r.map((state, i) => {
          let style = ButtonStyle.Secondary;
          let label = '-';
          if (state === 'X') { style = ButtonStyle.Primary; label = 'X'; }
          if (state === 'O') { style = ButtonStyle.Success; label = 'O'; }
          return new ButtonBuilder()
            .setCustomId(`ttt_${i}`)
            .setLabel(label)
            .setStyle(style)
            .setDisabled(state !== null);
        })
      );
    };

    const embed = new EmbedBuilder()
      .setTitle('Tic-Tac-Toe')
      .setDescription(`Waiting for an opponent! React or click to play against ${message.author.toString()}`);

    const row1 = getRow(board.slice(0, 3));
    const row2 = getRow(board.slice(3, 6));
    const row3 = getRow(board.slice(6, 9));

    const msg = await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });
    
    // Simple placeholder for gameplay loop
    return msg;
  }
};
