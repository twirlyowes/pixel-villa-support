const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.on("debug", m => console.log("[DEBUG]", m));
client.on("warn", console.warn);
client.on("error", console.error);
client.on("shardError", console.error);

client.once("ready", () => {
  console.log("READY:", client.user.tag);
});

client.login("YOUR_TOKEN_HERE")
  .then(() => console.log("LOGIN RESOLVED"))
  .catch(err => console.error("LOGIN FAILED:", err));
