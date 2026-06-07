import e, { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { isSasp } from '../helpers/userTypes';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import State from '@/states/models/State';
import Scope from '@/authz/models/Scope';
import User from '@/authn/models/User';
import { OrganizationService } from '@/organization/services/organization';
import { MFAService } from '@/authn/services/mfa';
import NotificationService from '@/notifications/services/notification.service';
import SaspService from '@/sasp/services/sasp.service';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { UserService } from '@/authn/services/user';
import { emailUpdateSchema, passwordResetSchema } from '@/authn/schemas/userSchema';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { AppError } from '@/utils/response/appError';
import { HaoRoleInvitationService } from '@/organization/services/haoRoleInvitation.service';
import { withTransaction } from '@/utils/transactionalOperation';

type UserOrganizationMembershipContactDto = {
  organizationId: string;
  organizationName: string;
  organizationUserId: number;
  title: string | null;
  phoneNumber: string | null;
  canEditOrganizationInfo: boolean;
};

type UserDetails = {
  id: string;
  name: string;
  email: string;
  isSasp: boolean;
  stateId?: number;
  stateName?: string;
  scopes?: Scope[];
  mfaEnabled?: boolean;
  isEmailVerified?: boolean;
  notificationToken: string;
  isAdmin?: boolean;
  /** True when every active organization membership allows profile edits (name/email). */
  canEditOrganizationInfo?: boolean;
  avatarUrl?: string | null;
  organizationMemberships: UserOrganizationMembershipContactDto[];
};

export const getAuthenticatedUserDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(req, res, new Error('Unauthorized'));
      return;
    }

    const user = await User.findOne({ where: { id: userId }, attributes: ['id', 'name', 'email', 'avatar_url', 'typeId'] });
    if (!user) return sendError(req, res, new Error('User not found'));

    const notificationToken = uuidv4();
    const notificationTokenHash = Buffer.from(notificationToken).toString('base64');
    await user.update({ notification_token: notificationToken });

    const isUserSasp = isSasp(user.typeId);
    const organizationMemberships = await OrganizationUserService.getOrganizationMembershipContactsForUser(user.id);
    const canEditOrganizationInfo = organizationMemberships.length === 0 ? true : organizationMemberships.every((m) => m.canEditOrganizationInfo);

    const userDetails: UserDetails = {
      id: user.id,
      name: user.name,
      email: user.email,
      isSasp: isUserSasp,
      scopes: req.user?.scopes,
      mfaEnabled: req.user?.mfaEnabled,
      isEmailVerified: req.user?.is_email_verified,
      notificationToken: notificationTokenHash,
      isAdmin: (req.user as { isAdmin?: boolean })?.isAdmin ?? false,
      canEditOrganizationInfo,
      avatarUrl: user.avatar_url ?? null,
      organizationMemberships,
    };

    if (isUserSasp) {
      const saspUser = await SaspUser.findOne({
        where: { userId: user.id },
        attributes: ['stateId'],
        include: [
          {
            model: State,
            as: 'state',
            attributes: ['stateId', 'stateName'],
          },
        ],
      });

      userDetails.stateId = saspUser?.state?.stateId;
      userDetails.stateName = saspUser?.state?.stateName;
    }

    sendSuccess(res, userDetails);
  } catch (error) {
    sendError(req, res, error);
  }
};

export const checkIfUserExists = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) throw new Error('Email is required');

    const user = await User.findOne({ where: { email } });
    const exists = user ? true : false;

    sendSuccess(res, { exists });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const getUserByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.params;

    if (!email) throw new Error('Email is required');

    const user = await User.findOne({
      where: { email },
      attributes: ['id', 'name', 'email'],
    });

    if (!user) throw new Error('User not found');

    sendSuccess(res, user);
  } catch (error) {
    sendError(req, res, error);
  }
};

export const respondHaoRoleInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized');

    const invitationId = String(req.params.invitationId);
    const { isAccepted } = req.body;
    if (typeof isAccepted !== 'boolean') throw new AppError(400, 'isAccepted must be a boolean');

    await withTransaction(async (transaction) => {
      await HaoRoleInvitationService.respondToInvitation(
        invitationId,
        userId,
        isAccepted,
        transaction,
      );
    });

    sendSuccess(res, { message: isAccepted ? 'Head Authorized Official role accepted' : 'Invitation declined' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const getMyInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const organizationInvitations = await OrganizationService.getMyInvitations(userId);
    const saspInvitations = await SaspService.getMyInvitations(userId);
    const haoRoleInvitations = await HaoRoleInvitationService.getMyInvitations(userId);
    sendSuccess(res, { saspInvitations, organizationInvitations, haoRoleInvitations });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const generateMFASecret = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendError(req, res, new Error('Unauthorized'));
    }

    const result = await MFAService.generateMFASecret(userId, req.ip || '', req.headers['user-agent'] || '');
    sendSuccess(res, result);
  } catch (error) {
    sendError(req, res, error);
  }
};

export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const { page = 1, limit = 20 } = req.query;
    const notifications = await NotificationService.list(userId, Number(page), Number(limit));

    sendSuccess(res, notifications);
  } catch (error) {
    sendError(req, res, error);
  }
};

export const verifyMFAToken = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { token } = req.body;

    if (!userId || !token) {
      return sendError(req, res, new Error('Missing required fields'));
    }

    const isValid = await MFAService.verifyMFAToken(userId, token, req.ip || '', req.headers['user-agent'] || '');
    if (!isValid) {
      return sendError(req, res, new Error('Invalid MFA token'));
    }

    sendSuccess(res, { message: 'MFA token verified successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) throw new Error('User ID is required');
    if (!notificationId) throw new Error('Notification ID is required');

    await NotificationService.markAsRead(userId, Number(notificationId));
    sendSuccess(res, { message: 'Notification marked as read' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const generateBackupCodes = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendError(req, res, new Error('Unauthorized'));
    }

    const backupCodes = await MFAService.generateBackupCodes(userId, req.ip || '', req.headers['user-agent'] || '');
    sendSuccess(res, { backupCodes });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    await NotificationService.markAllAsRead(userId);
    sendSuccess(res, { message: 'All notifications marked as read' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const verifyBackupCode = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { code } = req.body;

    if (!userId || !code) {
      return sendError(req, res, new Error('Missing required fields'));
    }

    const isValid = await MFAService.verifyBackupCode(userId, code, req.ip || '', req.headers['user-agent'] || '');
    if (!isValid) {
      return sendError(req, res, new Error('Invalid backup code'));
    }

    sendSuccess(res, { message: 'Backup code verified successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const enableMFA = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendError(req, res, new Error('Unauthorized'));
    }

    await MFAService.enableMFA(userId, req.ip || '', req.headers['user-agent'] || '');
    sendSuccess(res, { message: 'MFA enabled successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const disableMFA = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendError(req, res, new Error('Unauthorized'));
    }

    await MFAService.disableMFA(userId, req.ip || '', req.headers['user-agent'] || '');
    sendSuccess(res, { message: 'MFA disabled successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const countUnreadNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const unreadCount = await NotificationService.countUnread(userId);
    sendSuccess(res, { unreadCount });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const updateAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'Unauthorized');

    const file = req.file;
    if (!file) throw new AppError(400, 'Avatar file is required');

    const avatarUrl = await UserService.updateAvatar(userId, file);
    sendSuccess(res, { message: 'Avatar updated successfully', avatarUrl });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const { name, organizationMemberships } = req.body as {
      name?: string;
      organizationMemberships?: Array<{
        organizationId: string;
        title?: string | null;
        phoneNumber?: string | null;
      }>;
    };

    const profileFieldsChanging =
      name !== undefined ||
      (organizationMemberships !== undefined && organizationMemberships.length > 0);

    if (profileFieldsChanging) {
      const canEdit = await OrganizationUserService.getCanEditOrganizationInfoForUser(userId);
      if (!canEdit) {
        throw new AppError(
          403,
          'Profile details cannot be edited while an eligibility application is under review.',
        );
      }
    }

    await UserService.updateProfile(userId, { name, organizationMemberships });
    sendSuccess(res, { message: 'Profile updated successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const updateEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const validated = await emailUpdateSchema.validate(req.body, { abortEarly: false });
    const canEdit = await OrganizationUserService.getCanEditOrganizationInfoForUser(userId);
    if (!canEdit) {
      throw new AppError(
        403,
        'Profile details cannot be edited while an eligibility application is under review.',
      );
    }

    await UserService.updateEmail(userId, validated.email);
    sendSuccess(res, {
      message:
        'A verification email has been sent to your new address. Please verify it before signing in with the new email.',
    });
  } catch (error) {
    sendError(req, res, error);
  }
};

export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new Error('User ID is required');

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new Error('Current and new passwords are required');
    const validatedData = await passwordResetSchema.validate({ password: newPassword });
    const { password } = validatedData;


    await UserService.updatePassword(userId, currentPassword, password);
    sendSuccess(res, { message: 'Password updated successfully' });
  } catch (error) {
    sendError(req, res, error);
  }
};