const { db } = require("./firebase");

async function migrateWarnings() {
  try {
    console.log("⏳ Starting warning migration...");

    const oldWarnings = {
      // PASTE YOUR OLD JSONBIN DATA HERE
    };

    for (const [userId, warnings] of Object.entries(oldWarnings)) {
      await db.collection("warnings").doc(userId).set({
        warnings: warnings
      });

      console.log(`✅ Migrated ${userId}`);
    }

    console.log("🎉 Warning migration completed!");
    process.exit();

  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
}

migrateWarnings();
