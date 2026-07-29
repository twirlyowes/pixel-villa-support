const { Client, GatewayIntentBits } = require("discord.js");
const config = require("./config.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("error", console.error);
client.on("warn", console.warn);
client.on("debug", console.log);

client.login(config.TOKEN)
  .then(() => console.log("Login promise resolved"))
  .catch(err => console.error("Login failed:", err));
