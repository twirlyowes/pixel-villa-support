const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const ms = require("ms");
const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const WARN_FILE = "./warnings.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

function getWarnings() {
  return JSON.parse(fs.readFileSync(WARN_FILE));
}

function saveWarnings(data) {
  fs.writeFileSync(
    WARN_FILE,
    JSON.stringify(data, null, 2)
  );
}

function makeEmbed(color, text) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(text)
    .setTimestamp();
}

function hasModPermission(member) {
  return member.permissions.has(
    PermissionsBitField.Flags.ModerateMembers
  );
}
function hasStaffRole(member) {
  return member.roles.cache.has(
    config.STAFF_ROLE_ID
  );
}

function hierarchyCheck(message, target) {

  if (target.id === message.author.id)
    return false;

  if (
    target.roles.highest.position >=
    message.member.roles.highest.position
  )
    return false;

  return true;
}


client.once("ready", () => {
  console.log(`${client.user.tag} is online!`);
});


client.on("messageCreate", async message => {

  if (
    message.author.bot ||
    !message.guild
  ) return;


  const args = message.content
    .trim()
    .split(/ +/);

  const command = args.shift().toLowerCase();


  try {


    if (command === "warn") {

      const user =
        message.mentions.members.first();

      const reason =
        args.slice(1).join(" ") ||
        "No reason provided";


      if (!user)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Mention a user to warn."
            )
          ]
        });


      if (!hasModPermission(message.member))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Moderate Members permission."
            )
          ]
        });


      if (!hierarchyCheck(message,user))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You cannot warn this user because of role hierarchy."
            )
          ]
        });


      const warnings = getWarnings();


      if (!warnings[user.id])
        warnings[user.id] = [];


      warnings[user.id].push({
        reason: reason,
        moderator: message.author.tag,
        date: new Date().toISOString()
      });


      saveWarnings(warnings);


      const embed =
  makeEmbed(
    "Yellow",
    `${user.user.tag} has been warned.\n\nReason: ${reason}\nModerator: ${message.author.tag}`
  );


      message.reply({
        embeds:[embed]
      });


      if(config.LOG_CHANNEL_ID){

        const log =
          message.guild.channels.cache.get(
            config.LOG_CHANNEL_ID
          );

        if(log)
          log.send({
            embeds:[embed]
          });

      }

    }
    if (command === "wlist") {

      const user =
        message.mentions.members.first();


      if (!user)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Mention a user."
            )
          ]
        });


      const warnings = getWarnings();


      if (
        !warnings[user.id] ||
        warnings[user.id].length === 0
      )
        return message.reply({
          embeds:[
            makeEmbed(
              "Green",
              `${user.user.tag} has no warnings.`
            )
          ]
        });


      const list =
        warnings[user.id]
        .map(
          (w,i)=>
          `${i + 1}. ${w.reason}\nModerator: ${w.moderator}`
        )
        .join("\n\n");


      message.reply({
        embeds:[
          new EmbedBuilder()
          .setColor("Yellow")
          .setTitle(`Warnings for ${user.user.tag}`)
          .setDescription(list)
          .setTimestamp()
        ]
      });

    }



    if (command === "wreset") {

      const user =
        message.mentions.members.first();


      if (!user)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Mention a user."
            )
          ]
        });


      if (!hasModPermission(message.member))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Moderate Members permission."
            )
          ]
        });


      if (!hierarchyCheck(message,user))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You cannot reset this user's warnings."
            )
          ]
        });


      const warnings = getWarnings();


      delete warnings[user.id];


      saveWarnings(warnings);


      message.reply({
        embeds:[
          makeEmbed(
            "Green",
            `Warnings reset for ${user.user.tag}.`
          )
        ]
      });

    }



    if(command === "mute") {

      const user =
        message.mentions.members.first();


      const time = args[1];


      const reason =
        args.slice(2).join(" ") ||
        "No reason provided";


      if(!user || !time)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Usage: mute @user 10m reason"
            )
          ]
        });


      if(!hasModPermission(message.member))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Moderate Members permission."
            )
          ]
        });


      if(!hierarchyCheck(message,user))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You cannot mute this user."
            )
          ]
        });


      const duration = ms(time);

if (!duration) {
  return message.reply({
    embeds: [
      makeEmbed(
        "Red",
        "Invalid time format. Use examples: 10m, 1h, 1d."
      )
    ]
  });
}

await user.timeout(
  duration,
  reason
);


      const embed =
        makeEmbed(
          "Red",
          `${user.user.tag} has been muted.\n\nTime: ${time}\nReason: ${reason}`
        );


      message.reply({
        embeds:[embed]
      });


      if(config.LOG_CHANNEL_ID){

        const log =
          message.guild.channels.cache.get(
            config.LOG_CHANNEL_ID
          );

        if(log)
          log.send({
            embeds:[embed]
          });

      }

    }



    if(command === "unmute") {

      const user =
        message.mentions.members.first();


      if(!user)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Mention a user."
            )
          ]
        });


      if(!hasModPermission(message.member))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Moderate Members permission."
            )
          ]
        });


      if(!hierarchyCheck(message,user))
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You cannot unmute this user."
            )
          ]
        });


      await user.timeout(null);


      message.reply({
        embeds:[
          makeEmbed(
            "Green",
            `${user.user.tag} has been unmuted.`
          )
        ]
      });

    }
    if(command === "purge") {

      if(
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      )
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Manage Messages permission."
            )
          ]
        });


      const amount = Number(args[0]);


      if(
        !amount ||
        amount < 1 ||
        amount > 100
      )
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Enter an amount between 1 and 100."
            )
          ]
        });


      await message.channel.bulkDelete(
        amount,
        true
      );


      const msg =
        await message.channel.send({
          embeds:[
            makeEmbed(
              "Green",
              `${amount} messages deleted.`
            )
          ]
        });


      setTimeout(() => {
        msg.delete().catch(()=>{});
      },3000);

    }



    if(command === "vcp") {

      const user =
        message.mentions.members.first();


      if(!user)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "Mention a user."
            )
          ]
        });


      if(
        !message.member.permissions.has(
          PermissionsBitField.Flags.MoveMembers
        )
      )
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You need Move Members permission."
            )
          ]
        });


      if(!message.member.voice.channel)
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You must be in a voice channel."
            )
          ]
        });


      if(
        user.roles.highest.position >=
        message.member.roles.highest.position
      )
        return message.reply({
          embeds:[
            makeEmbed(
              "Red",
              "You cannot move this user because of role hierarchy."
            )
          ]
        });


      await user.voice.setChannel(
        message.member.voice.channel
      );


      message.reply({
        embeds:[
          makeEmbed(
            "Green",
            `${user.user.tag} moved to your voice channel.`
          )
        ]
      });

    }


  } catch(error) {

    console.error(error);

    message.reply({
      embeds:[
        makeEmbed(
          "Red",
          "An error occurred while executing the command."
        )
      ]
    }).catch(()=>{});

  }

});

require("./afk")(client);

client.login(config.TOKEN);
client.login(config.TOKEN);
