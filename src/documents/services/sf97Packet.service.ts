import { PropertyService } from '@/properties/services/property';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { RequestAttachmentService } from '@/properties/services/requestAttachment';
import { RequestAttachmentTypeEnum } from '@/properties/enums/requestAttachmentTypes';
import { isSf97EligibleProperty, requestHasSf97EligibleProperty } from '@/utils/sf97-eligible-fsc';
import Sf97Packet from '../models/Sf97Packet.entity';
import Invoice, { InvoiceStatus } from '@/documents/models/Invoice.entity';
import RequestAttachment from '@/properties/models/RequestAttachment';

export type Sf97EligiblePropertyInfo = {
  icn: string;
  hasRequestForm: boolean;
  requestFormAttachmentId?: number;
  sf97PacketId?: number;
  hasFinalUpload: boolean;
};

export class Sf97PacketService {
  /**
   * SF-97 eligibility and record for a request (standalone document, separate from logistics packet).
   */
  static async getSf97Info(requestId: number) {
    const loarAttachment = await RequestAttachmentService.getAttachment({
      request_id: requestId,
      attachment_type: RequestAttachmentTypeEnum.LOAR,
    });

    const sf97Attachments = await RequestAttachment.findAll({
      where: {
        request_id: requestId,
        attachment_type: RequestAttachmentTypeEnum.SF97,
      },
    });

    const sf97Packets = await Sf97Packet.findAll({
      where: { request_id: requestId },
    });

    const properties = await PropertyService.getAllPropertiesByRequestId(requestId);
    const allocatedProperties = (properties || []).filter((p) => p.property_allocated_quantity > 0);
    let fscEligible = false;
    let icnToDetail: Awaited<ReturnType<typeof PropertyDataService.getManyPropertyDetails>> = [];
    if (allocatedProperties.length > 0) {
      const icnList = allocatedProperties.map((p) => p.property_control_number);
      icnToDetail = await PropertyDataService.getManyPropertyDetails(icnList);
      fscEligible = requestHasSf97EligibleProperty(allocatedProperties, icnToDetail);
    }

    const paidInvoice = await Invoice.findOne({
      where: { request_id: requestId, status: InvoiceStatus.PAID },
    });

    const eligibleProperties: Sf97EligiblePropertyInfo[] = [];
    for (const prop of allocatedProperties) {
      const icn = prop.property_control_number;
      const pd = icnToDetail.find((d) => d.data?.itemControlNumber === icn);
      if (!pd || !isSf97EligibleProperty(pd)) continue;

      const packet = sf97Packets.find((pkt) => pkt.property_control_number === icn);
      const requestFormAttachmentId = packet?.attachment_id;
      const hasRequestForm = !!packet && !!requestFormAttachmentId;

      let hasFinalUpload = false;
      if (packet && requestFormAttachmentId) {
        const extra = sf97Attachments.filter(
          (a) =>
            a.property_control_number === icn &&
            a.id !== requestFormAttachmentId
        );
        hasFinalUpload = extra.length > 0;
      }

      eligibleProperties.push({
        icn,
        hasRequestForm,
        ...(requestFormAttachmentId ? { requestFormAttachmentId } : {}),
        ...(packet ? { sf97PacketId: packet.id } : {}),
        hasFinalUpload,
      });
    }

    return {
      sf97Attachment: null as RequestAttachment | null,
      sf97Packet: null,
      fscEligible,
      invoicePaid: !!paidInvoice,
      loarExists: !!loarAttachment,
      eligibleProperties,
    };
  }
}
