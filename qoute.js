const {
  createCanvas,
  loadImage,
  GlobalFonts,
} = require('@napi-rs/canvas');
const {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const TRIGGER = '.quote';
const COOLDOWN_MS = 5000;
const STATE_TTL_MS = 60 * 60 * 1000; // buttons work for 1 hour
const MAX_CHARS = 400;

const W = 1200;
const H = 630;

// Optional: put Inter.ttf in ./fonts for consistent text on Render
const FONT_PATH = path.join(__dirname, 'fonts', 'Inter.ttf');
const HAS_CUSTOM_FONT = fs.existsSync(FONT_PATH);
if (HAS_CUSTOM_FONT) GlobalFonts.registerFromPath(FONT_PATH, 'QuoteFont');

const FONTS = {
  sans: HAS_CUSTOM_FONT ? 'QuoteFont' : 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
};

const cooldowns = new Map();
const states = new Map(); // bot message id -> quote state

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function render(state) {
  const { text, displayName, username, avatar, color, light, bold, fontKey } = state;
  const family = FONTS[fontKey] || FONTS.sans;
  const weight = bold ? 'bold ' : '';

  const bg = light ? '255,255,255' : '0,0,0';
  const mainText = light ? '#111111' : '#ffffff';
  const nameText = light ? '#333333' : '#e5e5e5';
  const handleText = light ? '#777777' : '#7a7a7a';
  const markText = light ? '#aaaaaa' : '#555555';

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `rgb(${bg})`;
  ctx.fillRect(0, 0, W, H);

  // Avatar, cover-fit into the left area
  const avatarW = 760;
  const scale = Math.max(avatarW / avatar.width, H / avatar.height);
  const dw = avatar.width * scale;
  const dh = avatar.height * scale;

  const tmp = createCanvas(avatarW, H);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(avatar, (avatarW - dw) / 2, (H - dh) / 2, dw, dh);

  if (!color) {
    const data = tctx.getImageData(0, 0, avatarW, H);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    tctx.putImageData(data, 0, 0);
  }
  ctx.drawImage(tmp, 0, 0);

  // Fade avatar into the background
  const fade = ctx.createLinearGradient(avatarW * 0.35, 0, avatarW, 0);
  fade.addColorStop(0, `rgba(${bg},0)`);
  fade.addColorStop(1, `rgba(${bg},1)`);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, avatarW, H);

  // Quote text, shrinks to fit
  const boxX = 680;
  const boxW = 470;
  const centerX = boxX + boxW / 2;
  const maxTextH = 340;

  let size = 60;
  let lines;
  let lineH;
  do {
    ctx.font = `${weight}${size}px ${family}`;
    lines = wrapLines(ctx, text, boxW);
    lineH = size * 1.25;
    size -= 2;
  } while (lines.length * lineH > maxTextH && size > 18);

  ctx.fillStyle = mainText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const blockH = lines.length * lineH;
  const startY = (H - blockH) / 2 - 40;
  lines.forEach((l, i) => ctx.fillText(l, centerX, startY + i * lineH));

  ctx.fillStyle = nameText;
  ctx.font = `italic 28px ${family}`;
  ctx.fillText(`- ${displayName}`, centerX, startY + blockH + 24);

  ctx.fillStyle = handleText;
  ctx.font = `20px ${family}`;
  ctx.fillText(`@${username}`, centerX, startY + blockH + 64);

  ctx.textAlign = 'right';
  ctx.fillStyle = markText;
  ctx.font = `16px ${family}`;
  ctx.fillText('Pixel Villa', W - 24, H - 32);

  return canvas.toBuffer('image/png');
}

function buildComponents(state) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('quote:color')
      .setLabel(state.color ? 'Color' : 'B/W')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quote:theme')
      .setLabel(state.light ? 'Light' : 'Dark')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quote:bold')
      .setLabel('B')
      .setStyle(state.bold ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('quote:remove')
      .setLabel('Remove')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote:font')
      .setPlaceholder('Font')
      .addOptions(
        { label: 'Sans', value: 'sans', default: state.fontKey === 'sans' },
        { label: 'Serif', value: 'serif', default: state.fontKey === 'serif' },
        { label: 'Mono', value: 'mono', default: state.fontKey === 'mono' },
      ),
  );

  return [row1, row2];
}

async function buildPayload(state) {
  const buffer = await render(state);
  return {
    files: [new AttachmentBuilder(buffer, { name: 'quote.png' })],
    components: buildComponents(state),
  };
}

module.exports = (client) => {
  // Clean up old quote states
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of states) {
      if (now - s.createdAt > STATE_TTL_MS) states.delete(id);
    }
  }, 10 * 60 * 1000).unref();

  // .quote as a reply
  client.on('messageCreate', async (message) => {
    try {
      if (message.author.bot || !message.guild) return;
      if (message.content.trim().toLowerCase() !== TRIGGER) return;

      if (!message.reference?.messageId) {
        return message.reply({
          content: 'Reply to a message with `.quote` to quote it.',
          allowedMentions: { repliedUser: false },
        });
      }

      const last = cooldowns.get(message.author.id) || 0;
      if (Date.now() - last < COOLDOWN_MS) return;
      cooldowns.set(message.author.id, Date.now());

      const target = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (!target) return;

      const text = target.cleanContent?.trim();
      if (!text) {
        return message.reply({
          content: 'That message has no text to quote.',
          allowedMentions: { repliedUser: false },
        });
      }

      const member = await message.guild.members.fetch(target.author.id).catch(() => null);
      const displayName =
        member?.displayName || target.author.globalName || target.author.username;
      const avatarURL = (member || target.author).displayAvatarURL({
        extension: 'png',
        size: 1024,
        forceStatic: true,
      });

      const state = {
        text: text.slice(0, MAX_CHARS),
        displayName,
        username: target.author.username,
        avatar: await loadImage(avatarURL),
        color: false,
        light: false,
        bold: false,
        fontKey: 'sans',
        requesterId: message.author.id,
        createdAt: Date.now(),
      };

      const payload = await buildPayload(state);
      const sent = await message.reply({
        ...payload,
        allowedMentions: { repliedUser: false },
      });
      states.set(sent.id, state);
    } catch (err) {
      console.error('[quote] failed:', err);
    }
  });

  // Buttons + font menu
  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
      if (!interaction.customId.startsWith('quote:')) return;

      const state = states.get(interaction.message.id);
      if (!state) {
        return interaction.reply({
          content: 'This quote has expired, so make a new one with `.quote`.',
          ephemeral: true,
        });
      }

      const canEdit =
        interaction.user.id === state.requesterId ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);
      if (!canEdit) {
        return interaction.reply({
          content: 'Only the person who made this quote can edit it.',
          ephemeral: true,
        });
      }

      const action = interaction.customId.split(':')[1];

      if (action === 'remove') {
        states.delete(interaction.message.id);
        await interaction.message.delete().catch(() => {});
        return interaction.deferUpdate().catch(() => {});
      }

      if (action === 'color') state.color = !state.color;
      else if (action === 'theme') state.light = !state.light;
      else if (action === 'bold') state.bold = !state.bold;
      else if (action === 'font') state.fontKey = interaction.values[0];

      await interaction.deferUpdate();
      const payload = await buildPayload(state);
      await interaction.editReply({ ...payload, attachments: [] });
    } catch (err) {
      console.error('[quote] interaction failed:', err);
    }
  });
};
