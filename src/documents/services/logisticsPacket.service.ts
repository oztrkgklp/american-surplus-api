import { Transaction } from 'sequelize';
import { getLogger } from '@/utils/logger';
import { RequestAttachmentService } from '@/properties/services/requestAttachment';
import { RequestAttachmentTypeEnum } from '@/properties/enums/requestAttachmentTypes';
import { PropertyService } from '@/properties/services/property';
import LogisticsPacket from '../models/LogisticsPacket.entity';

const logger = getLogger('LogisticsPacketService');

export class LogisticsPacketService {

    /**
     * Checks if a request is eligible for logistics packet generation
     * @param requestId The ID of the request to check
     * @returns Object indicating eligibility and reasons
     */
    static async checkEligibility(requestId: number) {
        try {
            // Check if request has allocated properties
            const properties = await PropertyService.getAllPropertiesByRequestId(requestId);
            if (!properties || properties.length === 0) {
                return {
                    eligible: false,
                    reason: 'No properties found for this request'
                };
            }

            const allocatedProperties = properties.filter(property => property.property_allocated_quantity > 0);
            if (allocatedProperties.length === 0) {
                return {
                    eligible: false,
                    reason: 'No allocated properties found for this request'
                };
            }

            // Check if LOAR exists (required for logistics packet)
            const loarAttachment = await RequestAttachmentService.getAttachment({
                request_id: requestId,
                attachment_type: RequestAttachmentTypeEnum.LOAR,
            });

            if (!loarAttachment) {
                return {
                    eligible: false,
                    reason: 'LOAR document must be generated before creating logistics packet'
                };
            }

            return {
                eligible: true,
                reason: 'Request is eligible for logistics packet generation'
            };

        } catch (error) {
            logger.error('Failed to check logistics packet eligibility', error);
            throw error;
        }
    }

    /**
     * Gets logistics packet information for a request
     * @param requestId The ID of the request
     * @returns Logistics packet information
     */
    static async getLogisticsPacketInfo(requestId: number) {
        try {
            // Get 
            const logisticsPacketAttachment = await RequestAttachmentService.getAttachment({ request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LogisticsPacket });
            const loarAttachment = await RequestAttachmentService.getAttachment({ request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LOAR });
            const logisticsPacket = await LogisticsPacket.findOne({ where: { request_id: requestId } });

            const properties = await PropertyService.getAllPropertiesByRequestId(requestId);
            const allocatedProperties = properties.filter(property => property.property_allocated_quantity > 0);

            return {
                logisticsPacket: logisticsPacketAttachment,
                loar: loarAttachment,
                totalProperties: allocatedProperties.length,
                eligible: await this.checkEligibility(requestId),
                shipping_name: logisticsPacket?.shipping_name
            };

        } catch (error) {
            logger.error('Failed to get logistics packet info', error);
            throw error;
        }
    }

    static async updateLogisticsPacketShippingName(requestId: number, shippingName: string, transaction?: Transaction) {
        try {
            await LogisticsPacket.update({ shipping_name: shippingName }, { where: { request_id: requestId }, transaction });
        } catch (error) {
            logger.error('Failed to update logistics packet shipping name', error);
            throw error;
        }
    }
}
