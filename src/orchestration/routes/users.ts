import { Router } from "express";

import { authenticate } from "@/orchestration/middleware/authenticate";
import { generateMFASecret, verifyMFAToken, generateBackupCodes, verifyBackupCode, enableMFA, disableMFA, checkIfUserExists, getAuthenticatedUserDetails, getUserByEmail, getMyInvitations, respondHaoRoleInvitation, listNotifications, markNotificationAsRead, markAllNotificationsAsRead, countUnreadNotifications, updateProfile, updatePassword, updateEmail } from "@/orchestration/controllers/users";

const router = Router();

router.get('/me', authenticate, getAuthenticatedUserDetails);

router.patch('/me/update-profile', authenticate, updateProfile);

router.patch('/me/update-password', authenticate, updatePassword);

router.patch('/me/update-email', authenticate, updateEmail);

router.post('/isExist', authenticate, checkIfUserExists);

router.get('/my-invitations', authenticate, getMyInvitations);

router.post('/hao-role-invitations/:invitationId/respond', authenticate, respondHaoRoleInvitation);

router.get('/:email', authenticate, getUserByEmail);

router.get('/notifications/all', authenticate, listNotifications);

router.patch('/notifications/:notificationId/read', authenticate, markNotificationAsRead);

router.patch('/notifications/read-all', authenticate, markAllNotificationsAsRead);

router.get('/notifications/unread-count', authenticate, countUnreadNotifications);

// MFA routes
router.post('/me/mfa/generate', authenticate, generateMFASecret);
router.post('/me/mfa/verify', authenticate, verifyMFAToken);
router.post('/me/mfa/backup-codes', authenticate, generateBackupCodes);
router.post('/me/mfa/verify-backup', authenticate, verifyBackupCode);
router.post('/me/mfa/enable', authenticate, enableMFA);
router.post('/me/mfa/disable', authenticate, disableMFA);

export default router;
