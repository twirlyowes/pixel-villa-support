const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  name: 'ttt',
  description: 'Play a game of Tic-Tac-Toe!',
  async execute(message) {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply('Please mention a valid user to play against!');
    }

    let board = Array(9).fill(null);
    let currentPlayer = message.author;
    let turnCount = 0;

    const renderBoard = () => {
      let rows = [];
      for (let i = 0; i < 3; i++) {
        let row = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
          let index = i * 3 + j;
          let label = board[index] === 'X' ? '❌' : board[index] === 'O' ? '⭕' : '➖';
          let style = board[index] ? ButtonStyle.Secondary : ButtonStyle.Primary;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_${index}`)
              .setLabel(label)
              .setStyle(style)
              .setDisabled(board[index] !== null)
          );
        }
        rows.push(row);
      }
      return rows;
    };

    const embed = new EmbedBuilder()
      .setTitle('Tic-Tac-Toe')
      .setDescription(`${currentPlayer}'s turn (**${currentPlayer === message.author ? '❌' : '⭕'}**)`)
      .setColor('#0099ff');

    const msg = await message.reply({ embeds: [embed], components: renderBoard() });

    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
      if (i.user.id !== currentPlayer.id) {
        return i.reply({ content: "It's not your turn!", ephemeral: true });
      }

      const index = parseInt(i.customId.split('_')[1]);
      board[index] = currentPlayer === message.author ? 'X' : 'O';
      turnCount++;

      const checkWin = () => {
        const wins = [
          [0,1,2], [3,4,5], [6,7,8], // Rows
          [0,3,6], [1,4,7], [2,5,8], // Columns
          [0,4,8], [2,4,6]           // Diagonals
        ];
        return wins.some(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
      };

      if (checkWin()) {
        collector.stop();
        embed.setDescription(`🎉 ${currentPlayer} wins the game!`);
        return i.update({ embeds: [embed], components: renderBoard() });
      }

      if (turnCount === 9) {
        collector.stop();
        embed.setDescription(`🤝 It's a draw!`);
        return i.update({ embeds: [embed], components: renderBoard() });
      }

      currentPlayer = currentPlayer === message.author ? opponent : message.author;
      embed.setDescription(`${currentPlayer}'s turn (**${currentPlayer === message.author ? '❌' : '⭕'}**)`);
      await i.update({ embeds: [embed], components: renderBoard() });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        msg.edit({ content: 'Game timed out!', components: [] }).catch(() => {});
      }
    });
  }
};
