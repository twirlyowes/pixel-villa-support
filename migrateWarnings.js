const { db } = require("./firebase");

const BIN_ID = "6a61af41f5f4af5e29b43bac";
const API_KEY = "$2a$10$7ax1ElP/SmGzPF3ag1EEV.xZOjE8SCqV1YAhLFmKhwMTV.U7nS5s2";

async function migrateWarnings() {
  try {
    console.log("⏳ Fetching old warnings...");

    const response = await fetch(
      `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`,
      {
        headers: {
          "X-Master-Key": API_KEY
        }
      }
    );

    const data = await response.json();

    const oldWarnings = data.record || data;

    console.log(`Found ${Object.keys(oldWarnings).length} users`);

    for (const [userId, warnings] of Object.entries(oldWarnings)) {

      await db.collection("warnings").doc(userId).set({
        warnings: warnings
      });

      console.log(`✅ Migrated ${userId}`);
    }

    console.log("🎉 Migration complete!");

  } catch (error) {
    console.error("❌ Migration failed:", error);
  }
}

migrateWarnings();
