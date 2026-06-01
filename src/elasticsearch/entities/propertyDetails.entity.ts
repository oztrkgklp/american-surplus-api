import 'reflect-metadata';
import { EsEntity, EsProperty, EsId } from '../decorators';
import { ElasticsearchIndex } from '@/utils/elasticsearch';

/**
 * Property Details Entity for Elasticsearch operations
 * 
 * This class defines the structure of property details documents
 * stored in the ppms-details Elasticsearch index.
 */

@EsEntity(ElasticsearchIndex.PROPERTY_DETAILS)
export class PropertyDetailsEntity {
    @EsId()
    public id!: string;

    @EsProperty('keyword')
    public icn!: string;

    @EsProperty('date')
    public timestamp!: string;

    @EsProperty('keyword')
    public type!: string;

    // Property data nested object
    @EsProperty('nested')
    public property_data!: {
        createdAt: string;
        updatedAt: string;
        createdBy: string;
        updatedBy: string;
        propertyId: number;
        itemControlNumber: string;
        aacId: string;
        agencyBureau: string;
        submittedDate: string;
        submittedBy: string;
        notify_poc: boolean;
        propertyRegion: string;
        propertyStatus: {
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            statusId: number;
            statusName: string;
            statusDescription: string;
        };
        airCraft: any | null;
        vehicle: any | null;
        weapon: any | null;
        vessel: any | null;
        computer: {
            computerId: number;
            hardwareType: string | null;
            equipmentType: string | null;
            processorType: string | null;
            processingSpeed: string | null;
            ram: string | null;
            hardDiskSize: string | null;
            hardDiskStatus: string;
            isEquipmentForComputersForLearning: boolean;
            isEquipmentForComputersForLearningEligible: string;
        } | null;
        trailerHome: any | null;
        reportingAgencyAddress: {
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            addressId: number;
            line1: string;
            line2: string;
            line3: string;
            city: string;
            stateCode: string;
            zip: string;
            zip2: string;
            overseasZip: string | null;
            isDeleted: boolean;
            instructions: string | null;
            latitude: number | null;
            longitude: number | null;
        };
        propertyLocation: {
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            addressId: number;
            line1: string;
            line2: string;
            line3: string;
            city: string;
            stateCode: string;
            zip: string;
            zip2: string;
            overseasZip: string | null;
            isDeleted: boolean;
            instructions: string | null;
            latitude: number | null;
            longitude: number | null;
        };
        propertyPOC: {
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            contactId: number;
            firstName: string;
            lastName: string;
            middleName: string;
            email: string;
            ccEmail: string;
            phone: number;
            fax: number | null;
            phoneExtension: string;
            isDeleted: boolean;
        };
        propertyCustodian: {
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            contactId: number;
            firstName: string;
            lastName: string;
            middleName: string;
            email: string;
            ccEmail: string;
            phone: number;
            fax: number | null;
            phoneExtension: string;
            isDeleted: boolean;
        };
        uploadItemList: Array<{
            createdAt: string;
            updatedAt: string;
            createdBy: string;
            updatedBy: string;
            id: number;
            itemType: string;
            name: string;
            description: string | null;
            size: number;
            uri: string;
            attachmentOrder: number;
            virusScanStatus: string;
            uploadDate: string;
            deleted: boolean;
            deletionDate: string | null;
            processed: boolean;
            processedDate: string | null;
            documentType: string | null;
            documentTypeDescription: string | null;
        }>;
        propertyNotes: any[];
        make: string | null;
        model: string | null;
        propertyType: string;
        contractInventoryCode: string;
        overseasInventoryCode: string;
        agencyLocationCode: string;
        agencyControlNumber: string;
        amountTobeReimbursed: string;
        manufacturer: string | null;
        manufactureDate: string | null;
        federalSalesCenter: string;
        excessReleaseDate: string | null;
        internalScreeningStartDate: string | null;
        surplusReleaseDate: string | null;
        cflScreeningStartDate: string | null;
        cflReleaseDate: string | null;
        externalScreeningStartDate: string | null;
        availableInSalesDate: string | null;
        acquisitionDate: string | null;
        fscCode: string;
        niinCode: string | null;
        itemName: string;
        specialDescriptionCode: string;
        specialDescriptionText: string;
        quantity: number;
        quantityReported: number;
        unitOfIssue: string;
        originalAcquisitionCost: number;
        totalAcquisitionCost: number;
        fairMarketValue: number | null;
        supplyConditionCode: string | null;
        conditionCode: string;
        hazardous: string;
        fscapCode: string;
        demilitarizationCode: string;
        isDeleted: boolean;
        propertyDescription: string;
        isSubmitted: boolean;
        notifyCustodian: boolean;
        valueAddedServices: string;
        isDonation: string;
        isExchangeSale: string;
        reimbursementRequiredFlag: string;
        reimbursementCode: string;
        dropAfterInternalScreening: boolean;
        withDrawnDate: string | null;
        withDrawnReason: string | null;
        withDrawnBy: string | null;
        rejectedDate: string | null;
        rejectedReason: string | null;
        inventoryCorrectionReason: string | null;
        rejectedBy: string | null;
        destroyedDate: string | null;
        destroyedReason: string | null;
        destroyedBy: string | null;
        categoryCode: number;
        salesItemName: string;
        categoryName: string;
        sourceCode: string;
        plantClearanceLineNumber: string | null;
        plantClearanceReferenceNumber: string | null;
        plantClearanceCaseNumber: string | null;
        partNumber: string | null;
        drmoCode: string | null;
        propertyCreationSource: string;
        recipientName: string | null;
        propertyGroup: string;
        donorInfo: any | null;
        recipientInfo: any | null;
        actionCode: string | null;
        salesCenter: string | null;
        assignedScoEmail: string | null;
        assignedMktSpclEmail: string | null;
        nasaItemIndicator: string | null;
        appraisalInfo: any | null;
        appraisalAgencyInfo: any | null;
        giftInfo: any | null;
        withdrawalComment: string | null;
        dosApproverName: string | null;
        dosApprovalDate: string | null;
        recalledDate: string | null;
        recalledReason: string | null;
        recalledBy: string | null;
        lastInventoryDate: string | null;
        lastInventoriedBy: string | null;
        siteStorage: string | null;
        countryCode: string | null;
        salesQuantity: number | null;
        salesUnitOfIssue: string;
        salesOac: number | null;
        salesTotalOac: number | null;
        salesPropertyDescription: string | null;
        count: number | null;
        oldSrdDate: string | null;
        isInternal: boolean;
        quantityRequested: number;
        isChangeRequestRequired: boolean | null;
        oldSRDValue: string | null;
        editDocumentsFlag: boolean;
        salesNotes: string | null;
        categoryCodeCount: number | null;
        vin: string | null;
        fgAPOContact: string | null;
    };

    // Metadata nested object
    @EsProperty('nested')
    public metadata!: {
        created: string;
        email: string;
        company: string;
        code_version: string;
    };

    // Flattened fields for easier searching
    @EsProperty('text')
    public item_name!: string;

    @EsProperty('text')
    public description!: string;

    @EsProperty('keyword')
    public category!: string;

    @EsProperty('keyword')
    public condition!: string;

    // Location nested object
    @EsProperty('nested')
    public location!: {
        createdAt: string;
        updatedAt: string;
        createdBy: string;
        updatedBy: string;
        addressId: number;
        line1: string;
        line2: string;
        line3: string;
        city: string;
        stateCode: string;
        zip: string;
        zip2: string;
        overseasZip: string | null;
        isDeleted: boolean;
        instructions: string | null;
        latitude: number | null;
        longitude: number | null;
    };

    // Geographic coordinates for radius search
    @EsProperty('geo_point')
    public geo_location!: {
        lat: number;
        lon: number;
    };
}