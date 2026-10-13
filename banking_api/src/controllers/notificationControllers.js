const AppError = require("../utils/AppError");
const {
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../db/store");

function parseLimit(raw) {
  if (raw === undefined) return { ok: true, limit: 20 };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false };
  }
  return { ok: true, limit };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false };
  }
  return { ok: true, id };
}

// Authenticated owner's notifications, newest first, cursor-paginated.
const list = async (req, res, next) => {
  try {
    const parsedLimit = parseLimit(req.query.limit);
    if (!parsedLimit.ok) {
      throw new AppError("limit must be an integer between 1 and 50", 400);
    }
    let cursor = null;
    if (req.query.cursor !== undefined) {
      const parsedCursor = parseId(req.query.cursor);
      if (!parsedCursor.ok) {
        throw new AppError("cursor must be a positive integer notification id", 400);
      }
      cursor = parsedCursor.id;
    }
    const { items, nextCursor } = await listNotifications(req.user.id, {
      limit: parsedLimit.limit,
      cursor,
    });
    res.status(200).json({
      success: true,
      data: items,
      page: { limit: parsedLimit.limit, nextCursor },
    });
  } catch (err) {
    next(err);
  }
};

const count = async (req, res, next) => {
  try {
    const unreadCount = await unreadNotificationCount(req.user.id);
    res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (err) {
    next(err);
  }
};

// Unknown ids and other users' ids both return 404 so ids cannot be probed.
const markOne = async (req, res, next) => {
  try {
    const parsed = parseId(req.params.id);
    if (!parsed.ok) {
      throw new AppError("A valid notification id is required", 400);
    }
    const result = await markNotificationRead(req.user.id, parsed.id);
    if (result.missing) {
      throw new AppError("Notification not found", 404);
    }
    res.status(200).json({
      success: true,
      message: result.already ? "Notification was already read" : "Notification marked as read",
      data: result.notification,
    });
  } catch (err) {
    next(err);
  }
};

const markAll = async (req, res, next) => {
  try {
    const { updated } = await markAllNotificationsRead(req.user.id);
    res.status(200).json({
      success: true,
      message: updated === 0 ? "No unread notifications" : "All notifications marked as read",
      data: { updated },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, count, markOne, markAll };
