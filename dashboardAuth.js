const crypto = require("crypto");
const { db } = require("./firebase");

const REQUEST_COLLECTION = "dashboardAuthRequests";
const LOGIN_CODE_COLLECTION = "dashboardLoginCodes";

const CODE_LENGTH = 6;
const CODE_EXPIRY_MS = 5 * 60 * 1000;

function generateCode() {
  return crypto
    .randomInt(0, 1000000)
    .toString()
    .padStart(CODE_LENGTH, "0");
}

function hashCode(code) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

async function processDashboardAuthRequest(client, doc) {
  const data = doc.data();

  if (!data || data.status !== "pending") return;

  const userId = data.userId;

  if (!userId || !/^\d{15,25}$/.test(userId)) {
    await doc.ref.update({
      status: "failed",
      error: "Invalid Discord User ID.",
      completedAt: new Date(),
    });

    return;
  }

  try {
    // Prevent the same request from being processed twice.
    await doc.ref.update({
      status: "processing",
      processingAt: new Date(),
    });

    const user = await client.users.fetch(userId);

    if (!user) {
      throw new Error("Discord user could not be found.");
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    const expiresAt = Date.now() + CODE_EXPIRY_MS;

    // Store the hashed code for dashboard verification.
    await db
      .collection(LOGIN_CODE_COLLECTION)
      .doc(userId)
      .set({
        userId,
        codeHash,
        expiresAt,
        used: false,
        createdAt: new Date(),
      });

    await user.send(
      `🔐 **Pixel Villa Dashboard Login**\n\n` +
      `Your dashboard verification code is:\n\n` +
      `**${code}**\n\n` +
      `This code expires in **5 minutes**.\n` +
      `If you did not request dashboard access, you can ignore this message.`
    );

    await doc.ref.update({
      status: "sent",
      sentAt: new Date(),
    });

    console.log(
      `[Dashboard Auth] Login code sent to Discord user ${userId}`
    );
  } catch (error) {
    console.error(
      `[Dashboard Auth] Failed for ${userId}:`,
      error.message
    );

    await doc.ref.update({
      status: "failed",
      error: error.message || "Failed to send login code.",
      failedAt: new Date(),
    });

    // Remove any code that may have been created before the DM failed.
    try {
      await db
        .collection(LOGIN_CODE_COLLECTION)
        .doc(userId)
        .delete();
    } catch (deleteError) {
      console.error(
        "[Dashboard Auth] Failed to clean up login code:",
        deleteError.message
      );
    }
  }
}

function startDashboardAuth(client) {
  console.log("[Dashboard Auth] System started.");

  setInterval(async () => {
    try {
      const snapshot = await db
        .collection(REQUEST_COLLECTION)
        .where("status", "==", "pending")
        .limit(10)
        .get();

      if (snapshot.empty) return;

      for (const doc of snapshot.docs) {
        await processDashboardAuthRequest(client, doc);
      }
    } catch (error) {
      console.error(
        "[Dashboard Auth] Firebase polling error:",
        error.message
      );
    }
  }, 3000);
}

module.exports = {
  startDashboardAuth,
};