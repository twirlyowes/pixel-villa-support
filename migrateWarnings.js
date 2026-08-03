const  db  = require("./firebase");
const oldWarnings = require("./warnings.json");

async function migrateWarnings() {
  try {
    console.log(`Found ${Object.keys(oldWarnings).length} users`);

    for (const [userId, warnings] of Object.entries(oldWarnings)) {

      await db.collection("warnings").doc(userId).set({
        warnings: warnings
      });

      console.log(`✅ Migrated ${userId}`);
    }

    console.log("🎉 Migration complete!");
    process.exit();

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

migrateWarnings();
