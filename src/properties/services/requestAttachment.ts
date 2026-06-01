import RequestAttachment from '@/properties/models/RequestAttachment';
import User from '@/authn/models/User';
import { AppError } from '@/utils/response/appError';
import { RequestAttachmentTypeEnum } from '../enums/requestAttachmentTypes';
import { Transaction } from 'sequelize';
import Invoice from '@/documents/models/Invoice.entity';
import LogisticsPacket from '@/documents/models/LogisticsPacket.entity';
import Sf97Packet from '@/documents/models/Sf97Packet.entity';

export class RequestAttachmentService {
  /**
   * Get all attachments for a specific request, including the users who created and updated them.
   * @param requestId - The ID of the request to fetch attachments for.
   */
  static async getAttachments(parameters: Partial<RequestAttachment>) {
    const attachments = await RequestAttachment.findAll({
      where: parameters,
      include: [
        {
          model: User,
          as: 'createdByUser',
          attributes: ['id', 'name'],
        },
        {
          model: User,
          as: 'updatedByUser',
          attributes: ['id', 'name'],
        },
        {
          model: Invoice,
          as: 'invoice',
        },
        {
          model: LogisticsPacket,
          as: 'logisticsPacket',
        },
        {
          model: Sf97Packet,
          as: 'sf97Packet',
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return attachments;
  }

  static async getAttachment(parameters: Partial<RequestAttachment>, transaction?: Transaction, order: string[] = ['createdAt', 'DESC']) {
    // Handle order array - if it has more than 2 elements, treat as nested array
    let orderClause: any;
    if (Array.isArray(order) && order.length > 2) {
      // If order is like ["createdAt", "DESC", "DESC"], treat as nested array
      orderClause = [order];
    } else if (Array.isArray(order) && order.length === 2) {
      // If order is like ["createdAt", "DESC"], use as is
      orderClause = [order];
    } else {
      // Single item case
      orderClause = [order];
    }

    return await RequestAttachment.findOne({ where: parameters, order: orderClause, transaction });
  }

  /**
   * Create a new attachment for a specific request.
   * @param requestId - The ID of the request to create an attachment for.
   * @param user - The uploading user object.
   * @param file - The file to be attached.
   * @param attachmentType - The type of the attachment.
   * @param userId - The ID of the user creating the attachment.
   */
  static async createAttachment(
    requestId: number,
    user: User,
    filePath: string,
    attachmentType: RequestAttachmentTypeEnum,
    displayName: string,
    transaction?: Transaction,
    property_control_number?: string | null,
  ) {
    const attachment = await RequestAttachment.create(
      {
        request_id: requestId,
        file_path: filePath,
        attachment_type: attachmentType,
        name: displayName,
        ...(property_control_number != null && property_control_number !== ''
          ? { property_control_number }
          : {}),
        created_by: user.id,
        updated_by: user.id,
      },
      { transaction }
    );

    return attachment;
  }

  static async updateAttachmentPath(attachmentId: number, newPath: string, user: User, transaction?: Transaction) {
    const attachment = await RequestAttachment.findByPk(attachmentId, { transaction });
    if (!attachment) throw new AppError(404, 'attachment not found');

    attachment.file_path = newPath;
    attachment.updated_by = user.id;
    await attachment.save({ transaction });
    return attachment;
  }

  static async hasLoarAttachment(requestId: number) {
    const loarAttachment = await RequestAttachment.findOne({
      where: {
        id: requestId,
        attachment_type: RequestAttachmentTypeEnum.LOAR,
      },
    });

    return loarAttachment !== null;
  }

  static async updateCreatedAt(attachmentId: number, transaction?: Transaction) {
    const attachment = await RequestAttachment.findByPk(attachmentId, { transaction });
    if (!attachment) throw new AppError(404, 'attachment not found');

    await attachment.update({ createdAt: new Date() }, { transaction });
  }
}
