import { Router } from "express";
import {
    verifyAuthentication,
    login,
    register,
    logout,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    resetPassword,
    refreshAccessToken,
    getHaoRoleInvitationPreview,
    completeHaoRoleInvitation,
} from '@/orchestration/controllers/authentication';
import { authenticate } from "@/orchestration/middleware/authenticate";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/verify", verifyAuthentication);
router.post("/logout", authenticate, logout);

router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);

router.get('/hao-role-invitation', getHaoRoleInvitationPreview);
router.post('/hao-role-invitation/complete', completeHaoRoleInvitation);

// Refresh access token using a valid refresh token
router.post('/refresh-token', refreshAccessToken);

export default router;