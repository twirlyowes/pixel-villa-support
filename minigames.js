// Location: .../Pixel Villa Support/minigames.js
const gameManager = require('./minigames/utils/GameManager');
const tictactoe = require('./minigames/tictactoe');
const rps = require('./minigames/rps');
const trivia = require('./minigames/trivia');

const config = {
    prefix: '!', // Matches Pixel Villa's prefix
    embedColor: '#FFB800' // Pixel Villa Gold theme color
};

module.exports = function (client) {
    client.on('messageCreate', async (message) => {
        if (!message.content.startsWith(config.prefix) || message.author.bot || !message.guild) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Check if the command matches our minigames suite
        const validCommands = ['tictactoe', 'ttt', 'rps', 'trivia'];
        if (!validCommands.includes(command)) return;

        // Enforce strict: 1 active game per text channel at a time
        if (gameManager.hasGame(message.channel.id)) {
            return message.reply('❌ A minigame is already running in this channel! Please finish it first.');
        }

        try {
            // Instantly reserve the channel to block race-conditions
            gameManager.setGame(message.channel.id, true);

            if (command === 'tictactoe' || command === 'ttt') {
                await tictactoe.run(message, config.embedColor);
            } else if (command === 'rps') {
                await rps.run(message, config.embedColor);
            } else if (command === 'trivia') {
                await trivia.run(message, config.embedColor);
            }
        } catch (error) {
            console.error(`[Minigame System Error] Failed to execute ${command}:`, error);
            message.channel.send('⚠️ A structural error occurred while starting this minigame.');
            
            // Clean up reservation if initialization crashes immediately
            gameManager.deleteGame(message.channel.id);
        }
    });
};
