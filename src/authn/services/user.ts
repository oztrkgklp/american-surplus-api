import User from '@/authn/models/User';
import { comparePasswords, hashPassword } from '@/utils/password';
import { AppError } from '@/utils/response/appError';
import { Transaction } from 'sequelize';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { v4 as uuidv4 } from 'uuid';
import envvars from '@/config/envvars';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { uploadToCdn } from '@/utils/storage/cdnUpload';

export type UserProfileUpdatePayload = {
  name?: string;
  organizationMemberships?: Array<{
    organizationId: string;
    title?: string | null;
    phoneNumber?: string | null;
  }>;
};

export class UserService {
  static async updateProfile(userId: string, profile: UserProfileUpdatePayload): Promise<void> {
    const { name, organizationMemberships } = profile;

    if (name !== undefined) {
      await User.update({ name }, { where: { id: userId } });
      await OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile(userId, { name });
    }

    if (organizationMemberships?.length) await OrganizationUserService.updateOrganizationMembershipContactFields(userId, organizationMemberships,);

  }

  /**
   * Change login email and require verification on the new address before it is treated as verified.
   */
  static async updateEmail(userId: string, email: string, transaction?: Transaction): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { id: userId }, transaction });
    if (!user) throw new AppError(404, 'User not found');

    if (user.email.toLowerCase() === normalizedEmail) return;

    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
      transaction,
    });
    if (existingUser && existingUser.id !== userId) {
      throw new AppError(409, 'An account with this email already exists');
    }

    const email_verification_token = uuidv4();
    const email_verification_expiry_date = Date.now() + 24 * 60 * 60 * 1000;

    await user.update(
      {
        email: normalizedEmail,
        is_email_verified: false,
        email_verification_token,
        email_verification_expiry_date,
      },
      { transaction },
    );

    const verifyUrl = `${envvars.ui}/email-verification?token=${email_verification_token}`;
    const renderData = {
      templateName: TemplateEnum.Email_Verification,
      data: { name: user.name, verifyUrl },
    };
    const mailContent = await renderEmail(renderData);
    await emailQueue.add(
      'emailVerificationNotification',
      {
        to: normalizedEmail,
        subject: 'Verify your email address to activate your account',
        html: mailContent as string,
      },
      { removeOnComplete: true, attempts: 3 },
    );

    await OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile(userId, {}, transaction);
  }

  static async updateAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const relativePath = `user-avatars/${userId}.${ext}`;
    const avatarUrl = await uploadToCdn(relativePath, file.buffer);
    await User.update({ avatar_url: avatarUrl }, { where: { id: userId } });
    return avatarUrl;
  }

  static async updatePassword(userId: string, currentPassword: string, password: string, transaction?: Transaction): Promise<void> {
    const user = await User.findOne({ where: { id: userId }, transaction });
    if (!user) throw new AppError(404, 'User not found');

    const isPasswordValid = await comparePasswords(currentPassword, user.password);
    if (!isPasswordValid) throw new AppError(401, 'Current password is incorrect', 'Attempted to update password with an incorrect current password');

    const newHashedPassword = await hashPassword(password);
    await User.update({ password: newHashedPassword }, { where: { id: userId }, transaction });
  }
}
