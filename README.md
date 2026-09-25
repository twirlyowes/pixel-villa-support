# 🏡 Pixel Villa Support

> A powerful, modern Discord support & moderation bot built for the **Pixel Villa** community.

Pixel Villa Support is a custom Discord bot designed to handle server moderation, support tickets, member management, activity tracking, and community utilities — all through a clean Discord-native interface.

---

## ✨ Features

### 🛡️ Moderation

* Warnings system
* Strike system
* Ban / moderation controls
* Staff permission checks
* Moderation logging
* Member management
* Persistent moderation records

### 🎫 Support System

* Discord support tickets
* Minecraft support
* Discord support
* Other support requests
* Staff-specific support roles
* Ticket logging
* Persistent ticket data

### 💤 AFK System

* Set an AFK status
* Automatically notify members when someone is AFK
* Automatically remove AFK when the member returns
* Persistent AFK storage

### ⏱️ Active Time

* Track staff/member activity
* Voice activity tracking
* Periodic database saves
* Session-end saving
* Daily activity reporting
* Automated activity resets

### 🔊 Voice System

* Join-to-create voice channels
* Temporary channel creation
* Channel ownership
* Voice channel controls
* Automatic cleanup of unused temporary channels

### 🎨 Custom UI

Pixel Villa Support uses a custom **Discord Components V2** interface instead of relying entirely on traditional embeds.

The UI uses:

* Sky-blue Pixel Villa branding
* Custom Discord emojis
* Compact profile/avatar elements
* Consistent cards
* Semantic success/error states
* Reusable UI components

---

## 🧰 Tech Stack

| Technology            | Purpose                  |
| --------------------- | ------------------------ |
| Node.js               | Runtime                  |
| Discord.js            | Discord API              |
| Firebase / Firestore  | Persistent data          |
| Express               | Health/keep-alive server |
| Discord Components V2 | Bot interface            |
| Render                | Hosting                  |

---

## 📁 Project Structure

```text
pixel-villa-support/
│
├── index.js
├── firebase.js
├── config.json
├── package.json
├── package-lock.json
│
├── help.js
├── afk.js
├── activetime.js
├── warn.js
├── strike.js
├── mod.js
├── voicesystem.js
│
├── lib/
│   └── pixelVillaUI.js
│
├── events/
│
├── commands/
│
└── README.md
```

> The exact structure may change as the project evolves.

---

## 💾 Data Storage

Pixel Villa Support uses **Firebase Firestore** for persistent server data.

Current systems using persistent storage include:

* Warnings
* Strikes
* AFK
* Active Time
* Modmail / support tickets
* Other bot configuration

This allows data to survive bot restarts and redeployments.

---

## 🔐 Permissions

Administrative and staff functionality is protected using Discord roles and permission checks.

Sensitive configuration such as:

* Bot token
* Firebase credentials
* API credentials
* Environment variables

should **never be committed to GitHub**.

Use environment variables or local configuration files that are excluded through `.gitignore`.

---

## ⚙️ Configuration

Create the required environment/configuration values before starting the bot.

Example:

```env
DISCORD_TOKEN=your_bot_token
```

Additional Firebase and service configuration may be required depending on the enabled systems.

**Never share your Discord bot token publicly.**

---

## 🚀 Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/twirlyowes/pixel-villa-support.git
cd pixel-villa-support
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the bot

Add the required environment variables and Firebase configuration.

### 4. Start the bot

```bash
node index.js
```

---

## ☁️ Deployment

Pixel Villa Support can be deployed to services such as **Render** or another Node.js hosting provider.

The application includes an HTTP health endpoint so hosting platforms can monitor the process.

Typical start command:

```bash
node index.js
```

---

## 🧑‍💻 Development

This project is primarily developed for the Pixel Villa Discord community.

When adding new functionality:

1. Keep features modular.
2. Avoid duplicating UI code.
3. Use the shared Pixel Villa UI system.
4. Keep database operations isolated.
5. Add permission checks to staff functionality.
6. Never commit secrets.
7. Test commands before deploying them.

---

## 🎨 Pixel Villa Design

The bot follows a consistent visual identity.

### Primary Accent

```text
#38BDF8
```

### Design Principles

* Dark Discord-inspired UI
* Sky-blue primary accent
* Minimal visual clutter
* Compact layouts
* Discord-native components
* Clear success/error states
* Consistent member avatars and emojis

---

## 📜 Commands

The command system is actively developed and may change over time.

Use:

```text
.help
```

inside the server to view the currently available commands.

---

## 🛠️ Status

**Development:** 🟢 Active

Pixel Villa Support is continuously being improved with new moderation, support, activity, and server-management functionality.

---

## 📌 Important

This bot is intended for use within the Pixel Villa Discord ecosystem.

Do not copy production credentials, Firebase keys, Discord tokens, or other private configuration into public repositories.

---

## 👤 Author

**twirlyowes**

GitHub:
https://github.com/twirlyowes

---

## ⭐ Support the Project

If you find the project useful, consider giving the repository a ⭐ on GitHub.

**Pixel Villa Support — built for the community.**
