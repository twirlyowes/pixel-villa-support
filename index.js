const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');
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
const STATE_TTL_MS = 60 * 60 * 1000; // controls work for 1 hour
const MAX_CHARS = 400;

const W = 1200;
const H = 630;

// ---------------------------------------------------------------- fonts
const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_DEFS = {
  mplus: {
    label: 'M PLUS Rounded 1c (mplus)',
    family: 'PV MPLUS Rounded',
    files: ['MPLUSRounded1c-Regular.ttf', 'MPLUSRounded1c-Bold.ttf'],
  },
  dmserif: {
    label: 'DM Serif Display (dmserif)',
    family: 'PV DM Serif',
    files: ['DMSerifDisplay-Regular.ttf'],
  },
  spacemono: {
    label: 'Space Mono (spacemono)',
    family: 'PV Space Mono',
    files: ['SpaceMono-Regular.ttf', 'SpaceMono-Bold.ttf'],
  },
  pacifico: {
    label: 'Pacifico (pacifico)',
    family: 'PV Pacifico',
    files: ['Pacifico-Regular.ttf'],
  },
  bebas: {
    label: 'Bebas Neue (bebas)',
    family: 'PV Bebas Neue',
    files: ['BebasNeue-Regular.ttf'],
  },
};

const availableFonts = [];
for (const [key, def] of Object.entries(FONT_DEFS)) {
  const found = def.files.filter((f) => fs.existsSync(path.join(FONT_DIR, f)));
  if (!found.length) continue;
  for (const f of found) GlobalFonts.registerFromPath(path.join(FONT_DIR, f), def.family);
  availableFonts.push(key);
}
if (!availableFonts.length) {
  FONT_DEFS.system = { label: 'System (system)', family: 'sans-serif', files: [] };
  availableFonts.push('system');
}
const DEFAULT_FONT = availableFonts[0];

// --------------------------------------------------------------- themes
const THEMES = {
  bw: { label: 'Black/White (default)', emoji: '⬛', bg: '#000000', fg: '#ffffff' },
  wb: { label: 'White/Black', emoji: '⬜', bg: '#ffffff', fg: '#000000' },
  midnight: { label: 'Midnight/Ice', emoji: '🟦', bg: '#0b1020', fg: '#e8ecff' },
  cream: { label: 'Cream/Charcoal', emoji: '🟫', bg: '#f5efe0', fg: '#2b2b2b' },
  rose: { label: 'Wine/Rose', emoji: '🟥', bg: '#1a0b12', fg: '#ffd6e7' },
  forest: { label: 'Forest/Mint', emoji: '🟩', bg: '#08150d', fg: '#d5ffe0' },
  grape: { label: 'Grape/White', emoji: '🟪', bg: '#1e1740', fg: '#ffffff' },
};

const BRIGHTNESS = [1, 0.65, 1.35]; // normal, dim, bright

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const cooldowns = new Map();
const states = new Map(); // bot message id -> quote state

// -------------------------------------------------------------- drawing
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
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
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

function fontStr({ italic, bold, size, family }) {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${family}", sans-serif`;
}

async function render(state, botName) {
  const theme = THEMES[state.themeKey] || THEMES.bw;
  const family = (FONT_DEFS[state.fontKey] || FONT_DEFS[DEFAULT_FONT]).family;
  const bg = hexToRgb(theme.bg);
  const fg = hexToRgb(theme.fg);
  const bgStr = bg.join(',');
  const fgStr = fg.join(',');

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);

  // ---- avatar: square, full card height, on the left (or right when flipped)
  const ax = state.flip ? W - H : 0;
  const av = state.avatar;
  const scale = Math.max(H / av.width, H / av.height);
  const dw = av.width * scale;
  const dh = av.height * scale;

  const tmp = createCanvas(H, H);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(av, (H - dw) / 2, (H - dh) / 2, dw, dh);

  const bright = BRIGHTNESS[state.brightness % BRIGHTNESS.length];
  if (!state.color || bright !== 1) {
    const img = tctx.getImageData(0, 0, H, H);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      let r = px[i];
      let g = px[i + 1];
      let b = px[i + 2];
      if (!state.color) r = g = b = r * 0.299 + g * 0.587 + b * 0.114;
      px[i] = Math.min(255, r * bright);
      px[i + 1] = Math.min(255, g * bright);
      px[i + 2] = Math.min(255, b * bright);
    }
    tctx.putImageData(img, 0, 0);
  }
  ctx.drawImage(tmp, ax, 0);

  // ---- fade the avatar into the background
  const fadeFrom = state.flip ? W - H * 0.4 : H * 0.4;
  const fadeTo = state.flip ? W - H * 0.9 : H * 0.9;
  const fade = ctx.createLinearGradient(fadeFrom, 0, fadeTo, 0);
  fade.addColorStop(0, `rgba(${bgStr},0)`);
  fade.addColorStop(1, `rgba(${bgStr},1)`);
  ctx.fillStyle = fade;
  ctx.fillRect(ax, 0, H, H);

  // ---- quote text (auto-shrinks to fit)
  const cx = state.flip ? W * 0.28 : W * 0.715;
  const boxW = 520;
  const maxTextH = 290;

  let size = 58;
  let lines;
  let lineH;
  do {
    ctx.font = fontStr({ italic: state.italic, bold: state.bold, size, family });
    lines = wrapLines(ctx, state.text, boxW);
    lineH = size * 1.2;
    if (lines.length * lineH <= maxTextH) break;
    size -= 2;
  } while (size >= 20);

  const quoteH = lines.length * lineH;
  const authorH = 30;
  const handleH = 22;
  const gap1 = 22;
  const gap2 = 4;
  const total = quoteH + gap1 + authorH + gap2 + handleH;
  const y0 = H * 0.5 - total / 2 + 8;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.fg;
  ctx.font = fontStr({ italic: state.italic, bold: state.bold, size, family });
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + i * lineH));

  // author: "- NAME" (upper-case, italic) + @handle
  ctx.fillStyle = theme.fg;
  ctx.font = fontStr({ italic: true, bold: false, size: 25, family });
  ctx.letterSpacing = '2px';
  ctx.fillText(`- ${state.displayName.toUpperCase()}`, cx, y0 + quoteH + gap1);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = `rgba(${fgStr},0.62)`;
  ctx.font = fontStr({ italic: false, bold: false, size: 20, family });
  ctx.fillText(`@${state.username}`, cx, y0 + quoteH + gap1 + authorH + gap2);

  // watermark, bottom right
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `rgba(${fgStr},0.55)`;
  ctx.font = fontStr({ italic: false, bold: false, size: 22, family });
  ctx.fillText(botName, W - 18, H - 16);

  return canvas;
}

function encode(canvas, format) {
  if (format === 'gif') {
    const { data } = canvas.getContext('2d').getImageData(0, 0, W, H);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(index, W, H, { palette });
    gif.finish();
    return Buffer.from(gif.bytes());
  }
  return canvas.toBuffer('image/png');
}

// ----------------------------------------------------------- components
function buildComponents(state) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quote:brightness').setEmoji('☀️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote:color').setEmoji('🎨').setStyle(state.color ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote:flip').setEmoji('🔄').setStyle(state.flip ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote:bold').setLabel('B').setStyle(state.bold ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('quote:italic').setEmoji('🆕').setStyle(state.italic ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote:font')
      .setPlaceholder('Font')
      .addOptions(
        availableFonts.map((key) => ({
          label: FONT_DEFS[key].label,
          value: key,
          default: state.fontKey === key,
        })),
      ),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('quote:theme')
      .setPlaceholder('Theme')
      .addOptions(
        Object.entries(THEMES).map(([key, t]) => ({
          label: t.label,
          value: key,
          emoji: t.emoji,
          default: state.themeKey === key,
        })),
      ),
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('quote:remove').setLabel('Remove my Quote').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('quote:format')
      .setLabel(state.format === 'gif' ? 'to PNG' : 'to GIF')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, row3, row4];
}

async function buildPayload(state, botName) {
  const canvas = await render(state, botName);
  const name = state.format === 'gif' ? 'quote.gif' : 'quote.png';
  return {
    files: [new AttachmentBuilder(encode(canvas, state.format), { name })],
    components: buildComponents(state),
  };
}

// ---------------------------------------------------------------- module
module.exports = (client) => {
  const botName = () => client.user?.username || 'Pixel Villa';

  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of states) if (now - s.createdAt > STATE_TTL_MS) states.delete(id);
  }, 10 * 60 * 1000).unref();

  // .quote (as a reply to a message)
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

      const target = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      if (!target) return;

      const text = (target.cleanContent || '')
        .replace(/<a?:(\w+):\d+>/g, ':$1:')
        .trim();
      if (!text) {
        return message.reply({
          content: 'That message has no text to quote.',
          allowedMentions: { repliedUser: false },
        });
      }

      const member = await message.guild.members.fetch(target.author.id).catch(() => null);
      const displayName = member?.displayName || target.author.globalName || target.author.username;
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
        themeKey: 'bw',
        fontKey: DEFAULT_FONT,
        color: false,
        flip: false,
        bold: false,
        italic: false,
        brightness: 0,
        format: 'png',
        requesterId: message.author.id,
        createdAt: Date.now(),
      };

      const payload = await buildPayload(state, botName());
      const sent = await message.reply({ ...payload, allowedMentions: { repliedUser: false } });
      states.set(sent.id, state);
    } catch (err) {
      console.error('[quote] failed:', err);
    }
  });

  // buttons + menus
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

      if (action === 'brightness') state.brightness = (state.brightness + 1) % BRIGHTNESS.length;
      else if (action === 'color') state.color = !state.color;
      else if (action === 'flip') state.flip = !state.flip;
      else if (action === 'bold') state.bold = !state.bold;
      else if (action === 'italic') state.italic = !state.italic;
      else if (action === 'format') state.format = state.format === 'gif' ? 'png' : 'gif';
      else if (action === 'font' && FONT_DEFS[interaction.values[0]]) state.fontKey = interaction.values[0];
      else if (action === 'theme' && THEMES[interaction.values[0]]) state.themeKey = interaction.values[0];

      await interaction.deferUpdate();
      const payload = await buildPayload(state, botName());
      await interaction.editReply({ ...payload, attachments: [] });
    } catch (err) {
      console.error('[quote] interaction failed:', err);
    }
  });
};

// exposed for local testing only
module.exports._test = { render, encode, availableFonts, THEMES, W, H };
