import { External3040SubCategory } from '@/enums/external3040Categories';
import {
  ExternalEligibilitySelection,
  FULL_ELIGIBILITY_MAPPING,
  InternalEligibilitySelection,
} from './eligibility-category.constants';

export class EligibilityCategoryMapper {
  public static toExternal(input: InternalEligibilitySelection, olderAmericansActSelected: boolean): ExternalEligibilitySelection | null {
    const row = FULL_ELIGIBILITY_MAPPING.find((mappingRow) => {
      const sameOrganizationType = mappingRow.organizationType === input.organizationType;
      const sameOrganizationSubType = mappingRow.organizationSubTypes.includes(input.organizationSubType);
      const samePublicPurpose = mappingRow.publicPurpose === input.publicPurpose;

      if (!sameOrganizationType || !sameOrganizationSubType || !samePublicPurpose) return false;
      if (!input.primaryActivity) return mappingRow.primaryActivities.length === 0;

      return mappingRow.primaryActivities.includes(input.primaryActivity);
    });

    if (!row?.external) return null;

    if (olderAmericansActSelected) {
      return { ...row.external, subCategory: External3040SubCategory.ASSISTANCE_TO_OLDER_AMERICANS, };
    }

    return row.external;
  }

  public static toInternalCandidates(input: ExternalEligibilitySelection): InternalEligibilitySelection[] {
    const candidates: InternalEligibilitySelection[] = [];

    const subCategoryMatches = (rowSub: External3040SubCategory | undefined): boolean => {
      if (input.subCategory === undefined) return rowSub === undefined;
      if (input.subCategory === External3040SubCategory.SBA_8_DONATIONS_OR_SBA_VOSB_DONATIONS) {
        return (
          rowSub === External3040SubCategory.SBA_8_DONATIONS ||
          rowSub === External3040SubCategory.SBA_VOSB_DONATIONS
        );
      }
      return rowSub === input.subCategory;
    };

    for (const row of FULL_ELIGIBILITY_MAPPING) {
      const samePrimaryCategory = row.external.primaryCategory === input.primaryCategory;
      if (!samePrimaryCategory || !subCategoryMatches(row.external.subCategory)) continue;

      for (const organizationSubType of row.organizationSubTypes) {
        if (row.primaryActivities.length === 0) {
          candidates.push({
            organizationType: row.organizationType,
            organizationSubType,
            publicPurpose: row.publicPurpose,
          });
          continue;
        }

        for (const primaryActivity of row.primaryActivities) {
          candidates.push({
            organizationType: row.organizationType,
            organizationSubType,
            publicPurpose: row.publicPurpose,
            primaryActivity,
          });
        }
      }
    }

    return this.deduplicateInternalSelections(candidates);
  }

  public static isMapped(input: InternalEligibilitySelection, olderAmericansActSelected: boolean): boolean {
    return this.toExternal(input, olderAmericansActSelected) !== null;
  }

  private static deduplicateInternalSelections(selections: InternalEligibilitySelection[],): InternalEligibilitySelection[] {
    const seen = new Set<string>();
    const result: InternalEligibilitySelection[] = [];

    for (const selection of selections) {
      const key = [
        selection.organizationType,
        selection.organizationSubType,
        selection.publicPurpose,
        selection.primaryActivity ?? '',
      ].join('||');

      if (seen.has(key)) continue;

      seen.add(key);
      result.push(selection);
    }

    return result;
  }
}
