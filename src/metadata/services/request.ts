import RequestStatus from '@/metadata/models/RequestStatus';
import RequestAttachmentType from '@/metadata/models/RequestAttachmentType';

export class RequestMetadataService {
    /**
     * Fetch all request attachment types.
     * @returns An array of request attachment types.
     */
    static async getRequestAttachmentTypes() {
        const requestAttachmentTypes = await RequestAttachmentType.findAll();
        return requestAttachmentTypes;
    }
}


