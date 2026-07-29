const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log("READY:", client.user.tag);
});

client.on("error", console.error);
client.on("warn", console.warn);
client.on("debug", console.log);

client.login(config.TOKEN)
  .then(() => console.log("LOGIN SUCCESS"))
  .catch(console.error);
