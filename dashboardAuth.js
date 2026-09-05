const crypto = require("crypto");
const {
  PermissionsBitField,
} = require("discord.js");

const { db } = require("./firebase");
const config = require("./config.json");

const REQUEST_COLLECTION = "dashboardAuthRequests";
const LOGIN_CODE_COLLECTION = "dashboardLoginCodes";
const ACTION_COLLECTION = "dashboardActions";
const AUDIT_COLLECTION = "dashboardAuditLogs";

const CODE_LENGTH = 6;
const CODE_EXPIRY_MS = 5 * 60 * 1000;

const GUILD_ID =
  process.env.DASHBOARD_GUILD_ID ||
  "1510176142286389329";

const ADMIN_USER_IDS = (
  process.env.ADMIN_USER_IDS || ""
)
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const STAFF_USER_IDS = (
  process.env.STAFF_USER_IDS || ""
)
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

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

async function createAuditLog({
  actorId,
  actorUsername,
  actorRole,
  action,
  targetUserId,
  reason,
  success,
  status,
  error = null,
  actionId = null,
}) {
  try {
    await db
      .collection(AUDIT_COLLECTION)
      .add({
        actor: {
          discordId: actorId || null,
          username: actorUsername || null,
          role: actorRole || "staff",
        },
        action: action || null,
        targetUserId: targetUserId || null,
        reason: reason || null,
        success: success === true,
        status,
        error: error || null,
        actionId: actionId || null,
        source: "dashboard-bot",
        createdAt: new Date(),
        timestamp: Date.now(),
      });
  } catch (error) {
    console.error(
      "[Dashboard Audit] Failed to save audit log:",
      error.message
    );
  }
}

async function processDashboardAuthRequest(
  client,
  doc
) {
  const data = doc.data();

  if (!data || data.status !== "pending") {
    return;
  }

  const userId = data.userId;

  if (
    !userId ||
    !/^\d{15,25}$/.test(userId)
  ) {
    await doc.ref.update({
      status: "failed",
      error: "Invalid Discord User ID.",
      completedAt: new Date(),
    });

    return;
  }

  try {
    await doc.ref.update({
      status: "processing",
      processingAt: new Date(),
    });

    const user =
      await client.users.fetch(userId);

    if (!user) {
      throw new Error(
        "Discord user could not be found."
      );
    }

    if (!ADMIN_USER_IDS.includes(userId)) {
      throw new Error(
        "This Discord user is not an authorized administrator."
      );
    }

    const code = generateCode();
    const codeHash = hashCode(code);

    const expiresAt =
      Date.now() + CODE_EXPIRY_MS;

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
      error:
        error.message ||
        "Failed to send login code.",
      failedAt: new Date(),
    });

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

async function getDashboardGuild(client) {
  const guild =
    client.guilds.cache.get(GUILD_ID) ||
    await client.guilds.fetch(GUILD_ID);

  if (!guild) {
    throw new Error(
      "Pixel Villa Discord server could not be found."
    );
  }

  return guild;
}

async function fetchTargetMember(
  guild,
  userId
) {
  try {
    return await guild.members.fetch(
      userId
    );
  } catch {
    throw new Error(
      "The target user is not a member of the server."
    );
  }
}

function requireBotPermission(
  guild,
  permission
) {
  const me =
    guild.members.me;

  if (!me) {
    throw new Error(
      "Bot member information is unavailable."
    );
  }

  if (
    !me.permissions.has(permission)
  ) {
    throw new Error(
      `Bot is missing the required Discord permission: ${permission}.`
    );
  }

  return me;
}

function hierarchyCheck(
  guild,
  target
) {
  const me =
    guild.members.me;

  if (!me) {
    throw new Error(
      "Bot member information is unavailable."
    );
  }

  if (
    target.id === me.id
  ) {
    throw new Error(
      "The bot cannot moderate itself."
    );
  }

  if (
    target.roles.highest.position >=
    me.roles.highest.position
  ) {
    throw new Error(
      "I cannot moderate this member because their highest role is equal to or higher than my highest role."
    );
  }

  return true;
}

async function executeDashboardAction(
  client,
  doc
) {
  const data = doc.data();

  if (
    !data ||
    data.status !== "pending"
  ) {
    return;
  }

  const actionId =
    data.actionId || doc.id;

  const action =
    data.action;

  const targetUserId =
    data.targetUserId;

  const reason =
    data.reason ||
    "Dashboard moderation action";

  const actor =
    data.requestedBy || {};

  const actorId =
    actor.discordId || null;

  const actorUsername =
    actor.username || null;

  const actorRole =
    actor.role || "staff";

  try {
    await doc.ref.update({
      status: "processing",
      processingAt: new Date(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error(
      `[Dashboard Action] Failed to claim ${actionId}:`,
      error.message
    );

    return;
  }

  try {
    const allowedActions = [
      "timeout",
      "remove-timeout",
      "warn",
      "kick",
      "ban",
      "unban",
    ];

    if (
      !allowedActions.includes(action)
    ) {
      throw new Error(
        "Unsupported moderation action."
      );
    }

    const isAdmin =
      actor.isAdmin === true ||
      ADMIN_USER_IDS.includes(actorId);

    const isStaff =
      actorRole === "staff" ||
      isAdmin;

    if (!isStaff) {
      throw new Error(
        "Dashboard actor does not have staff permissions."
      );
    }

    if (
      ["kick", "ban", "unban"].includes(
        action
      ) &&
      !isAdmin
    ) {
      throw new Error(
        "Administrator access is required for this action."
      );
    }

    const guild =
      await getDashboardGuild(client);

    if (action === "unban") {
      requireBotPermission(
        guild,
        PermissionsBitField.Flags.BanMembers
      );

      let ban;

      try {
        ban =
          await guild.bans.fetch(
            targetUserId
          );
      } catch {
        throw new Error(
          "That user is not currently banned."
        );
      }

      if (!ban) {
        throw new Error(
          "That user is not currently banned."
        );
      }

      await guild.members.unban(
        targetUserId,
        reason
      );

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          message:
            "Member successfully unbanned.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    const target =
      await fetchTargetMember(
        guild,
        targetUserId
      );

    if (action === "timeout") {
      requireBotPermission(
        guild,
        PermissionsBitField.Flags.ModerateMembers
      );

      hierarchyCheck(
        guild,
        target
      );

      if (!target.moderatable) {
        throw new Error(
          "The bot cannot timeout this member."
        );
      }

      const durationMs =
        Number(data.durationMs);

      if (
        !Number.isFinite(
          durationMs
        ) ||
        durationMs <= 0
      ) {
        throw new Error(
          "Invalid timeout duration."
        );
      }

      await target.timeout(
        durationMs,
        reason
      );

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          durationMs,
          message:
            "Member successfully timed out.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    if (
      action === "remove-timeout"
    ) {
      requireBotPermission(
        guild,
        PermissionsBitField.Flags.ModerateMembers
      );

      hierarchyCheck(
        guild,
        target
      );

      if (!target.moderatable) {
        throw new Error(
          "The bot cannot modify this member."
        );
      }

      await target.timeout(
        null,
        reason
      );

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          message:
            "Member timeout successfully removed.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    if (action === "warn") {
      const ref =
        db.collection("warnings")
          .doc(targetUserId);

      const existing =
        await ref.get();

      const currentWarnings =
        existing.exists
          ? existing.data()?.warnings || []
          : [];

      const warnId =
        Math.floor(
          100000 +
          Math.random() * 900000
        ).toString();

      const now =
        new Date();

      const newWarning = {
        id: warnId,
        moderator:
          actorUsername ||
          actorId ||
          "Dashboard Staff",
        reason,
        timestamp:
          now.toISOString(),
      };

      const updatedWarnings = [
        ...currentWarnings,
        newWarning,
      ];

      await ref.set({
        warnings:
          updatedWarnings,
      });

      let dmedUser = false;

      try {
        await target.send(
          `⚠️ **Warning Received | ${guild.name}**\n\n` +
          `You have received a warning in **${guild.name}**.\n\n` +
          `**Reason:** ${reason}\n\n` +
          `**Warning ID:** ${warnId}`
        );

        dmedUser = true;
      } catch {
        dmedUser = false;
      }

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          warningId: warnId,
          warningCount:
            updatedWarnings.length,
          dmedUser,
          message:
            "Warning successfully issued.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    if (action === "kick") {
      requireBotPermission(
        guild,
        PermissionsBitField.Flags.KickMembers
      );

      hierarchyCheck(
        guild,
        target
      );

      if (!target.kickable) {
        throw new Error(
          "The bot cannot kick this member."
        );
      }

      await target.kick(
        reason
      );

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          message:
            "Member successfully kicked.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    if (action === "ban") {
      requireBotPermission(
        guild,
        PermissionsBitField.Flags.BanMembers
      );

      hierarchyCheck(
        guild,
        target
      );

      if (!target.bannable) {
        throw new Error(
          "The bot cannot ban this member."
        );
      }

      await target.ban({
        reason,
      });

      await doc.ref.update({
        status: "completed",
        result: {
          success: true,
          action,
          targetUserId,
          message:
            "Member successfully banned.",
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      await createAuditLog({
        actorId,
        actorUsername,
        actorRole,
        action,
        targetUserId,
        reason,
        success: true,
        status: "completed",
        actionId,
      });

      return;
    }

    throw new Error(
      "Action handler not implemented."
    );
  } catch (error) {
    console.error(
      `[Dashboard Action] ${actionId} failed:`,
      error.message
    );

    await doc.ref.update({
      status: "failed",
      result: {
        success: false,
        action,
        targetUserId,
      },
      error:
        error.message ||
        "Moderation action failed.",
      failedAt: new Date(),
      updatedAt: new Date(),
    });

    await createAuditLog({
      actorId,
      actorUsername,
      actorRole,
      action,
      targetUserId,
      reason,
      success: false,
      status: "failed",
      error:
        error.message ||
        "Moderation action failed.",
      actionId,
    });
  }
}

function startDashboardAuth(client) {
  console.log(
    "[Dashboard Auth] System started."
  );

  setInterval(async () => {
    try {
      const snapshot =
        await db
          .collection(
            REQUEST_COLLECTION
          )
          .where(
            "status",
            "==",
            "pending"
          )
          .limit(10)
          .get();

      if (snapshot.empty) {
        return;
      }

      for (
        const doc of snapshot.docs
      ) {
        await processDashboardAuthRequest(
          client,
          doc
        );
      }
    } catch (error) {
      console.error(
        "[Dashboard Auth] Firebase polling error:",
        error.message
      );
    }
  }, 3000);

  setInterval(async () => {
    try {
      const snapshot =
        await db
          .collection(
            ACTION_COLLECTION
          )
          .where(
            "status",
            "==",
            "pending"
          )
          .limit(10)
          .get();

      if (snapshot.empty) {
        return;
      }

      for (
        const doc of snapshot.docs
      ) {
        await executeDashboardAction(
          client,
          doc
        );
      }
    } catch (error) {
      console.error(
        "[Dashboard Actions] Firebase polling error:",
        error.message
      );
    }
  }, 3000);

  console.log(
    "[Dashboard Actions] Moderation action processor started."
  );
}

module.exports = {
  startDashboardAuth,
};