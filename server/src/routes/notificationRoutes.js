const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { authenticate } = require("../middleware/authMiddleware");
const asyncHandler = require("../middleware/asyncHandler");

// All routes require authentication
router.use(authenticate);

router.get("/", asyncHandler(notificationController.getUserNotifications));
router.get("/unread-count", asyncHandler(notificationController.getUnreadCount));
router.put("/read-all", asyncHandler(notificationController.markAllAsRead));
router.delete("/read", asyncHandler(notificationController.deleteReadNotifications));

router.get("/preferences", asyncHandler(notificationController.getPreferences));
router.put("/preferences", asyncHandler(notificationController.updatePreferences));

router.put("/:id/read", asyncHandler(notificationController.markAsRead));
router.delete("/:id", asyncHandler(notificationController.deleteNotification));

module.exports = router;
