/* Auto-generated from: American Surplus Eligibility Categories - Updated March 2026.xlsx */
/*
  Notes:
  - Reverse mapping is one-to-many. A 3040 primary/sub category can map to many internal combinations.
  - The spreadsheet has a few label typos; they are normalized here to your internal enums.
    * 'Multi-jurisdictinal District' -> MULTI_JURISDICTIONAL_DISTRICT
    * 'Public Tracked Company' -> PUBLICLY_TRADED_COMPANY
    * 'Childcare Center' -> CHILD_CARE_CENTER
    * "Sheriff's Department" -> SHERIFFS_OFFICE
    * 'Service Educational Entitativity (SEA)' -> SERVICE_EDUCATIONAL_ACTIVITY
    * 'Veteran Service Organization (VSO)' -> VETERAN_SERVICE_ORGANIZATIONS
    * 'Volunteer Rescue Squad (Quazi Public)' -> VOLUNTEER_RESCUE_SQUAD
  - For-profit: SBA 8(a) Donations and SBA VOSB Donations are separate 3040 lines; each maps only to its primary activities (see diagram).
*/

import {
  OrganizationType,
  OrganizationSubType,
  PublicPurpose,
  PrimaryActivity,
} from '@/enums/organizationCategories';
import {
  External3040PrimaryCategory,
  External3040SubCategory,
} from '@/enums/external3040Categories';

export type InternalEligibilitySelection = {
  organizationType: OrganizationType;
  organizationSubType: OrganizationSubType;
  publicPurpose: PublicPurpose;
  primaryActivity?: PrimaryActivity;
};

export type ExternalEligibilitySelection = {
  primaryCategory: External3040PrimaryCategory;
  subCategory?: External3040SubCategory;
};

export type MappingRow = {
  organizationType: OrganizationType;
  organizationSubTypes: OrganizationSubType[];
  publicPurpose: PublicPurpose;
  primaryActivities: PrimaryActivity[];
  external: ExternalEligibilitySelection;
};

export const FULL_ELIGIBILITY_MAPPING: MappingRow[] = [
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.CIVIC_INFRASTRUCTURE,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION, PrimaryActivity.AIRPORT, PrimaryActivity.LIBRARY],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_PURPOSE,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.CONSERVATION,
    primaryActivities: [PrimaryActivity.CONSERVATION_PROGRAM, PrimaryActivity.ENVIRONMENTAL_PROTECTION_PROGRAM, PrimaryActivity.HISTORIC_LIGHT_STATION, PrimaryActivity.NATURAL_RESOURCE_MANAGEMENT],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.CONSERVATION,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.DIGITAL_ACCESS,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.DISASTER_AND_EMERGENCY,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_SAFETY,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.ECONOMIC_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.ECONOMIC_DEVELOPMENT_PROGRAM],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.ECONOMIC_DEVELOPMENT,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.EDUCATION,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.COLLEGE, PrimaryActivity.EDUCATION_PROGRAM, PrimaryActivity.EDUCATIONAL_BROADCAST_STATION, PrimaryActivity.EDUCATIONAL_INSTITUTION, PrimaryActivity.MUSEUM, PrimaryActivity.SCHOOL, PrimaryActivity.SCHOOL_FOR_MENTALLY_OR_PHYSICALLY_DISABLED, PrimaryActivity.UNIVERSITY],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.ENERGY_AND_UTILITIES,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.OTHER,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.HOUSING_AND_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_THE_HOMELESS,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.LEGAL_AID_AND_JUSTICE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.PARKS_AND_RECREATION,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION, PrimaryActivity.PARKS_AND_RECREATION_PROGRAM],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PARKS_AND_RECREATION,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.POVERTY_AND_HOMELESSNESS,
    primaryActivities: [PrimaryActivity.HOMELESS_SERVICES_PROVIDER, PrimaryActivity.ANTI_POVERTY_SERVICES_PROVIDER, PrimaryActivity.FOOD_ASSISTANCE_PROVIDER, PrimaryActivity.SELF_HELP_HOUSING_GROUP, PrimaryActivity.EDUCATIONAL_ASSISTANCE_ORGANIZATION, PrimaryActivity.WORKFORCE_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.FAMILY_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.LEGAL_AID_AND_SUPPORT_PROVIDER],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.PUBLIC_HEALTH,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.CLINIC, PrimaryActivity.DENTAL_SCHOOL, PrimaryActivity.GERIATRIC_CENTER, PrimaryActivity.HEALTH_CENTER, PrimaryActivity.HOSPITAL, PrimaryActivity.MEDICAL_LABORATORY, PrimaryActivity.MEDICAL_RESEARCH_CENTER, PrimaryActivity.MEDICAL_SCHOOL, PrimaryActivity.MUSEUM, PrimaryActivity.NURSING_SCHOOL, PrimaryActivity.PUBLIC_HEALTH_INSTITUTION, PrimaryActivity.PUBLIC_HEALTH_PROGRAM, PrimaryActivity.SUBSTANCE_ABUSE_TREATMENT_CENTER, PrimaryActivity.ENVIRONMENTAL_HEALTH, PrimaryActivity.SANITATION_AND_SEWAGE, PrimaryActivity.DISEASE_CONTROL],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.PUBLIC_SAFETY,
    primaryActivities: [PrimaryActivity.POLICE_DEPARTMENT, PrimaryActivity.SHERIFFS_OFFICE, PrimaryActivity.COURT_SYSTEM, PrimaryActivity.CORRECTIONAL_INSTITUTION, PrimaryActivity.CIVIL_DEFENSE_ORGANIZATION, PrimaryActivity.FIRE_DEPARTMENT, PrimaryActivity.RESCUE_SQUAD, PrimaryActivity.VOLUNTEER_FIRE_DEPARTMENT, PrimaryActivity.VOLUNTEER_RESCUE_SQUAD],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_SAFETY,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.TRANSPORTATION_AND_INFRASTRUCTURE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_PURPOSE,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.VETERANS_SERVICES,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.PUBLIC_AGENCY,
    organizationSubTypes: [OrganizationSubType.LOCAL, OrganizationSubType.STATE, OrganizationSubType.FEDERAL, OrganizationSubType.PUBLIC_AUTHORITY, OrganizationSubType.PUBLIC_INSTRUMENTALITY, OrganizationSubType.MULTI_JURISDICTIONAL_DISTRICT, OrganizationSubType.SPECIAL_DISTRICT, OrganizationSubType.TRIBAL_OR_SOVEREIGN_NATION],
    publicPurpose: PublicPurpose.WORKFORCE_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.PUBLIC_AGENCY_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.CIVIC_INFRASTRUCTURE,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION, PrimaryActivity.LIBRARY],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.CONSERVATION,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.DIGITAL_ACCESS,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.DISASTER_AND_EMERGENCY,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.ECONOMIC_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.EDUCATION,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.SCHOOL, PrimaryActivity.SCHOOL_FOR_MENTALLY_OR_PHYSICALLY_DISABLED, PrimaryActivity.COLLEGE, PrimaryActivity.UNIVERSITY, PrimaryActivity.EDUCATIONAL_INSTITUTION, PrimaryActivity.EDUCATION_PROGRAM, PrimaryActivity.EDUCATIONAL_BROADCAST_STATION, PrimaryActivity.MUSEUM, PrimaryActivity.SERVICE_EDUCATIONAL_ACTIVITY],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.ENERGY_AND_UTILITIES,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.HOUSING_AND_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_THE_HOMELESS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.LEGAL_AID_AND_JUSTICE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PARKS_AND_RECREATION,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.POVERTY_AND_HOMELESSNESS,
    primaryActivities: [PrimaryActivity.ANTI_POVERTY_SERVICES_PROVIDER, PrimaryActivity.FOOD_ASSISTANCE_PROVIDER, PrimaryActivity.SELF_HELP_HOUSING_GROUP, PrimaryActivity.EDUCATIONAL_ASSISTANCE_ORGANIZATION, PrimaryActivity.WORKFORCE_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.FAMILY_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.LEGAL_AID_AND_SUPPORT_PROVIDER],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_THE_HOMELESS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PUBLIC_HEALTH,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.HOSPITAL, PrimaryActivity.CLINIC, PrimaryActivity.HEALTH_CENTER, PrimaryActivity.SUBSTANCE_ABUSE_TREATMENT_CENTER, PrimaryActivity.PUBLIC_HEALTH_INSTITUTION, PrimaryActivity.PUBLIC_HEALTH_PROGRAM, PrimaryActivity.MEDICAL_RESEARCH_CENTER, PrimaryActivity.GERIATRIC_CENTER, PrimaryActivity.MEDICAL_LABORATORY, PrimaryActivity.MEDICAL_SCHOOL, PrimaryActivity.DENTAL_SCHOOL, PrimaryActivity.NURSING_SCHOOL, PrimaryActivity.MUSEUM, PrimaryActivity.ENVIRONMENTAL_HEALTH, PrimaryActivity.SANITATION_AND_SEWAGE, PrimaryActivity.DISEASE_CONTROL],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PUBLIC_SAFETY,
    primaryActivities: [PrimaryActivity.VOLUNTEER_FIRE_DEPARTMENT, PrimaryActivity.VOLUNTEER_RESCUE_SQUAD],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.TRANSPORTATION_AND_INFRASTRUCTURE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.VETERANS_SERVICES,
    primaryActivities: [PrimaryActivity.VETERAN_SERVICE_ORGANIZATIONS],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NONPROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.WORKFORCE_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.CIVIC_INFRASTRUCTURE,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION, PrimaryActivity.LIBRARY],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.CONSERVATION,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.DIGITAL_ACCESS,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.DISASTER_AND_EMERGENCY,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.ECONOMIC_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.EDUCATION,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.SCHOOL, PrimaryActivity.SCHOOL_FOR_MENTALLY_OR_PHYSICALLY_DISABLED, PrimaryActivity.COLLEGE, PrimaryActivity.UNIVERSITY, PrimaryActivity.EDUCATIONAL_INSTITUTION, PrimaryActivity.EDUCATION_PROGRAM, PrimaryActivity.EDUCATIONAL_BROADCAST_STATION, PrimaryActivity.MUSEUM, PrimaryActivity.SERVICE_EDUCATIONAL_ACTIVITY],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.ENERGY_AND_UTILITIES,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.HOUSING_AND_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_THE_HOMELESS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.LEGAL_AID_AND_JUSTICE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PARKS_AND_RECREATION,
    primaryActivities: [PrimaryActivity.HISTORIC_LIGHT_STATION],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.POVERTY_AND_HOMELESSNESS,
    primaryActivities: [PrimaryActivity.ANTI_POVERTY_SERVICES_PROVIDER, PrimaryActivity.FOOD_ASSISTANCE_PROVIDER, PrimaryActivity.SELF_HELP_HOUSING_GROUP, PrimaryActivity.EDUCATIONAL_ASSISTANCE_ORGANIZATION, PrimaryActivity.WORKFORCE_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.FAMILY_SUPPORT_SERVICES_PROVIDER, PrimaryActivity.LEGAL_AID_AND_SUPPORT_PROVIDER],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_THE_HOMELESS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PUBLIC_HEALTH,
    primaryActivities: [PrimaryActivity.CHILD_CARE_CENTER, PrimaryActivity.HOSPITAL, PrimaryActivity.CLINIC, PrimaryActivity.HEALTH_CENTER, PrimaryActivity.SUBSTANCE_ABUSE_TREATMENT_CENTER, PrimaryActivity.PUBLIC_HEALTH_INSTITUTION, PrimaryActivity.PUBLIC_HEALTH_PROGRAM, PrimaryActivity.MEDICAL_RESEARCH_CENTER, PrimaryActivity.GERIATRIC_CENTER, PrimaryActivity.MEDICAL_LABORATORY, PrimaryActivity.MEDICAL_SCHOOL, PrimaryActivity.DENTAL_SCHOOL, PrimaryActivity.NURSING_SCHOOL, PrimaryActivity.MUSEUM, PrimaryActivity.ENVIRONMENTAL_HEALTH, PrimaryActivity.SANITATION_AND_SEWAGE, PrimaryActivity.DISEASE_CONTROL],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.PUBLIC_SAFETY,
    primaryActivities: [PrimaryActivity.VOLUNTEER_FIRE_DEPARTMENT, PrimaryActivity.VOLUNTEER_RESCUE_SQUAD],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.TRANSPORTATION_AND_INFRASTRUCTURE,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.ASSISTANCE_TO_IMPOVERISHED_FAMILIES_OR_INDIVIDUALS,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.VETERANS_SERVICES,
    primaryActivities: [PrimaryActivity.VETERAN_SERVICE_ORGANIZATIONS],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.PUBLIC_HEALTH,
    },
  },
  {
    organizationType: OrganizationType.NOT_FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PUBLIC_BENEFIT_NONPROFIT, OrganizationSubType.RELIGIOUS_ORGANIZATION, OrganizationSubType.VETERANS_SERVICE_ORGANIZATION, OrganizationSubType.FISCALLY_SPONSORED_PROJECT, OrganizationSubType.MEMBERSHIP_BASED_NONPROFIT, OrganizationSubType.UNINCORPORATED_NONPROFIT_ASSOCIATION],
    publicPurpose: PublicPurpose.WORKFORCE_DEVELOPMENT,
    primaryActivities: [],
    external: {
      primaryCategory: External3040PrimaryCategory.NON_PROFIT_DONATIONS,
      subCategory: External3040SubCategory.EDUCATION,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.CONSERVATION,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.CONSERVATION,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.DIGITAL_ACCESS,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.DIGITAL_ACCESS,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.DISASTER_AND_EMERGENCY,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.DISASTER_AND_EMERGENCY,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.ECONOMIC_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.ECONOMIC_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.EDUCATION,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.EDUCATION,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.ENERGY_AND_UTILITIES,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.ENERGY_AND_UTILITIES,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.HOUSING_AND_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.HOUSING_AND_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.LEGAL_AID_AND_JUSTICE,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.LEGAL_AID_AND_JUSTICE,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PARKS_AND_RECREATION,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PARKS_AND_RECREATION,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.POVERTY_AND_HOMELESSNESS,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.POVERTY_AND_HOMELESSNESS,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PUBLIC_HEALTH,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PUBLIC_HEALTH,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PUBLIC_SAFETY,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.PUBLIC_SAFETY,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.TRANSPORTATION_AND_INFRASTRUCTURE,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.TRANSPORTATION_AND_INFRASTRUCTURE,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.VETERANS_SERVICES,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.VETERANS_SERVICES,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.WORKFORCE_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.SBA_8A_SMALL_BUSINESS_ECONOMICALLY_OR_SOCIALLY_DISADVANTAGED],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_8_DONATIONS,
    },
  },
  {
    organizationType: OrganizationType.FOR_PROFIT,
    organizationSubTypes: [OrganizationSubType.PRIVATELY_HELD_BUSINESS, OrganizationSubType.PUBLIC_BENEFIT_CORPORATION, OrganizationSubType.FRANCHISE_BUSINESS, OrganizationSubType.PUBLICLY_TRADED_COMPANY, OrganizationSubType.HOLDING_COMPANY, OrganizationSubType.JOINT_VENTURE, OrganizationSubType.STARTUP_BUSINESS],
    publicPurpose: PublicPurpose.WORKFORCE_DEVELOPMENT,
    primaryActivities: [PrimaryActivity.VETERAN_OWNED_SMALL_BUSINESS, PrimaryActivity.SERVICE_DISABLED_VETERAN_OWNED_SMALL_BUSINESS],
    external: {
      primaryCategory: External3040PrimaryCategory.MISCELLANEOUS_DONATIONS_TRANSFERS,
      subCategory: External3040SubCategory.SBA_VOSB_DONATIONS,
    },
  },
] as const;
