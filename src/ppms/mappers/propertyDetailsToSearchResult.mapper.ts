import { PropertyDetailsEntity } from '@/elasticsearch/entities/propertyDetails.entity';
import { PropertySearchResult } from '@/ppms/types/summary';

/**
 * Maps PropertyDetailsEntity to PropertySearchResult (summary-like shape for API).
 */
export class PropertyDetailsToSearchResultMapper {
  /**
   * Maps a single PropertyDetailsEntity to PropertySearchResult.
   */
  static toSearchResult(entity: PropertyDetailsEntity): PropertySearchResult {
    const pd = entity.property_data;
    const loc = pd.propertyLocation;
    const firstUpload = pd.uploadItemList?.length
      ? pd.uploadItemList[0]
      : null;
    const reimbursementRequired =
      pd.reimbursementRequiredFlag === 'N' ? 'N' : 'Y';
    return {
      itemControlNumber: pd.itemControlNumber,
      propertyLocationDTO: {
        zip: loc?.zip ?? '',
        city: loc?.city ?? '',
        stateCode: loc?.stateCode ?? '',
      },
      excessReleaseDate: pd.excessReleaseDate ?? '',
      surplusReleaseDate: pd.surplusReleaseDate ?? '',
      cflReleaseDate: pd.cflReleaseDate ?? '',
      submittedDate: pd.submittedDate ?? '',
      submittedBy: pd.submittedBy ?? '',
      createdBy: pd.createdBy ?? null,
      itemStatus: pd.propertyStatus?.statusName ?? '',
      itemName: pd.itemName ?? '',
      fscCode: pd.fscCode ?? '',
      fscDescription: pd.propertyDescription ?? '',
      conditionCode: pd.conditionCode ?? '',
      originalAcquisitionCost: pd.originalAcquisitionCost ?? 0,
      quantityAvailable: pd.quantity ?? 0,
      quantityRequested: pd.quantityRequested ?? 0,
      quantityReqByMe: 0,
      unitOfIssue: pd.unitOfIssue ?? '',
      reimbursementRequired,
      fairMarketValue: pd.fairMarketValue ?? null,
      presignedUrl: firstUpload?.uri ?? '',
      path: null,
      fileName: firstUpload?.uri?.split?.('/')?.pop?.() ?? null,
      propertyId: pd.propertyId,
      categoryCode: pd.categoryCode,
      categoryName: pd.categoryName ?? '',
      agencyBureau: pd.agencyBureau ?? '',
      custodianEmail: pd.propertyCustodian?.email ?? '',
      pocEmail: pd.propertyPOC?.email ?? '',
      custodianCCEmail: pd.propertyCustodian?.ccEmail ?? '',
      pocCCEmail: pd.propertyPOC?.ccEmail ?? '',
      statusFlag: {
        itemControlNumber: pd.itemControlNumber,
        editFlag: false,
        editDocumentsFlag: pd.editDocumentsFlag ?? false,
        requests: null,
      },
      internal: pd.isInternal ?? false,
    };
  }
}
