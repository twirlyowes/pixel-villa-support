const ttt = require('./ttt.js');
const rps = require('./rps.js');

module.exports = {
  name: 'minigames',
  description: 'Minigames hub',
  async execute(message, args) {
    const game = args[0]?.toLowerCase();
    
    if (game === 'ttt') {
      return ttt.execute(message);
    } else if (game === 'rps') {
      return rps.execute(message);
    } else {
      return message.reply('Please choose a game to play! Available games: `ttt`, `rps`');
    }
  }
};
