const fs = require("fs");
const path = require("path");

const CHANNEL_URL = "https://www.youtube.com/@mioxyie";
const NOTIFICATION_CHANNEL_ID = "1514164027012419704";
const CHECK_INTERVAL = 5 * 60 * 1000;
const FEED_LIMIT = 15;
const HISTORY_PAGES = 5;
const STATE_FILE = path.join(__dirname, "youtube-state.json");

let client = null;
let channelId = null;
let checking = false;

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { lastChecked: null };
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (error) {
    console.error("[YouTube] Failed to read state:", error);
    return { lastChecked: null };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.error("[YouTube] Failed to save state:", error);
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.text();
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .trim();
}

function getTag(entry, tag) {
  const match = entry.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")
  );
  return match ? decodeXml(match[1]) : null;
}

async function resolveChannelId() {
  if (channelId) return channelId;

  const html = await fetchText(CHANNEL_URL);

  const patterns = [
    /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
    /"externalId":"(UC[a-zA-Z0-9_-]{22})"/,
    /"browseId":"(UC[a-zA-Z0-9_-]{22})"/,
    /channel\/(UC[a-zA-Z0-9_-]{22})/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      channelId = match[1];
      console.log(`[YouTube] Resolved channel ID: ${channelId}`);
      return channelId;
    }
  }

  throw new Error("Could not resolve the YouTube channel ID.");
}

async function getRecentVideos() {
  const id = await resolveChannelId();
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
  const xml = await fetchText(feedUrl);

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
    .slice(0, FEED_LIMIT)
    .map(match => {
      const entry = match[1];
      const id = getTag(entry, "yt:videoId");

      if (!id) return null;

      return {
        id,
        title: getTag(entry, "media:title") || "New upload",
        published: getTag(entry, "published"),
        url: `https://www.youtube.com/watch?v=${id}`
      };
    })
    .filter(Boolean);

  return entries;
}

async function getNotificationChannel() {
  const channel =
    client.channels.cache.get(NOTIFICATION_CHANNEL_ID) ||
    await client.channels.fetch(NOTIFICATION_CHANNEL_ID).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error(
      `Discord channel ${NOTIFICATION_CHANNEL_ID} could not be found or is not text-based.`
    );
  }

  return channel;
}

async function getAlreadyPostedVideoIds(channel) {
  const ids = new Set();
  let before;

  for (let page = 0; page < HISTORY_PAGES; page++) {
    const messages = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {})
    });

    if (!messages.size) break;

    for (const message of messages.values()) {
      const matches = message.content.match(
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g
      );

      if (!matches) continue;

      for (const url of matches) {
        const id = url.match(/v=([a-zA-Z0-9_-]{11})/)?.[1];
        if (id) ids.add(id);
      }
    }

    before = messages.last().id;

    if (messages.size < 100) break;
  }

  return ids;
}

async function sendNotification(channel, video) {
  await channel.send({
    content: `@everyone 📢 **Mioxyie Uploaded new video**\n${video.title}\n${video.url}`,
    allowedMentions: { parse: ["everyone"] }
  });

  console.log(`[YouTube] Sent notification: ${video.title}`);
}

async function checkYouTube() {
  if (checking || !client?.isReady()) return;

  checking = true;

  try {
    const channel = await getNotificationChannel();
    const videos = await getRecentVideos();

    if (!videos.length) {
      console.log("[YouTube] No recent uploads found.");
      return;
    }

    const postedIds = await getAlreadyPostedVideoIds(channel);
    const state = loadState();

    const missing = videos
      .filter(video => !postedIds.has(video.id))
      .sort((a, b) => {
        const aTime = Date.parse(a.published || "") || 0;
        const bTime = Date.parse(b.published || "") || 0;
        return aTime - bTime;
      });

    if (!missing.length) {
      state.lastChecked = new Date().toISOString();
      saveState(state);
      console.log("[YouTube] No unannounced uploads found.");
      return;
    }

    for (const video of missing) {
      await sendNotification(channel, video);
    }

    state.lastChecked = new Date().toISOString();
    state.lastNotifiedVideoId = missing[missing.length - 1].id;
    saveState(state);
  } catch (error) {
    console.error("[YouTube] Check failed:", error);
  } finally {
    checking = false;
  }
}

module.exports = function startYouTube(discordClient) {
  client = discordClient;

  console.log("[YouTube] Notification system started.");
  console.log(`[YouTube] Watching: ${CHANNEL_URL}`);
  console.log(
    `[YouTube] Notifications: ${NOTIFICATION_CHANNEL_ID}`
  );

  const start = () => {
    checkYouTube();
    setInterval(checkYouTube, CHECK_INTERVAL);
  };

  if (client.isReady()) {
    start();
  } else {
    client.once("clientReady", start);
  }
};
