import { PropertyDetails } from "@/ppms/types/propertyDetails";
import { PropertyCreationAttributes } from "@/properties/models/Property";
import { PropertyDataService } from "@/ppms/services/propertyData";

/**
 * Determines if a property is a titled motorized asset — a vehicle, vessel, or
 * aircraft — by requiring both that PPMS has populated the corresponding
 * classification slot (`vehicle`, `vessel`, or `airCraft`) and that the FSC
 * code matches a known group prefix or exception for that category. FSC alone
 * is not sufficient because the same groups also cover non-asset items such as
 * trailers, floating docks, and airframe components; the PPMS marker confirms
 * the entry is the asset itself.
 *
 * FSC coverage:
 * - Vehicles: 24xx (Tractors) + exceptions 1740 (aircraft tugs), 2305 (ground
 *   effect), 2310 (passenger MV), 2320 (trucks), 2340 (motorcycles),
 *   2350 (combat/assault), 2355 (LCV).
 * - Vessels: 19xx (Ships, Small Craft, Pontoons, Floating Docks).
 * - Aircraft: exceptions 1510 (fixed wing), 1520 (rotary wing), 1540 (gliders),
 *   1550 (drones). 15xx as a whole is intentionally not used because it also
 *   includes airframe structural components.
 *
 * Shared by rules that only apply to these assets:
 * - Pickup evidence is required regardless of AOC.
 * - SF-97 generation/upload is gated on this classification
 *   (see `isSf97EligibleProperty` in `utils/sf97-eligible-fsc.ts`).
 *
 * @param propertyDetails - Property details from PPMS
 * @returns true if property is a vehicle, vessel, or aircraft; false otherwise
 */
const VEHICLE_FSC_GROUP_PREFIXES = ['24'] as const;
const VEHICLE_FSC_EXCEPTIONS = new Set(['1740', '2305', '2310', '2320', '2340', '2350', '2355']);
const VESSEL_FSC_GROUP_PREFIXES = ['19'] as const;
const AIRCRAFT_FSC_EXCEPTIONS = new Set(['1510', '1520', '1540', '1550']);

function normalizeFscCode(rawFscCode: string | undefined | null): string | null {
  if (!rawFscCode) return null;
  const normalized = String(rawFscCode).trim();
  return normalized.length === 4 ? normalized : null;
}

function hasMarker(value: unknown): boolean {
  return value != null && typeof value === 'object';
}

function fscMatches(
  fscCode: string,
  prefixes: readonly string[],
  exceptions: ReadonlySet<string>
): boolean {
  const prefix = fscCode.slice(0, 2);
  if (prefixes.includes(prefix)) return true;
  return exceptions.has(fscCode);
}

export function isPropertyVehicle(propertyDetails: PropertyDetails): boolean {
  const fscCode = normalizeFscCode(propertyDetails?.data?.fscCode);
  if (!fscCode) return false;

  const data = propertyDetails?.data;
  // PPMS populates exactly one of these slots as an object when the property
  // is the corresponding asset (and leaves it null otherwise). Pair each
  // marker with its own FSC range so a misplaced marker on a parts record
  // (vehicle/vessel/aircraft FSC group also contains components) doesn't slip
  // through.
  const isVehicle =
    hasMarker(data?.vehicle) && fscMatches(fscCode, VEHICLE_FSC_GROUP_PREFIXES, VEHICLE_FSC_EXCEPTIONS);
  const isVessel =
    hasMarker(data?.vessel) && fscMatches(fscCode, VESSEL_FSC_GROUP_PREFIXES, new Set());
  const isAircraft =
    hasMarker(data?.airCraft) && fscMatches(fscCode, [], AIRCRAFT_FSC_EXCEPTIONS);

  return isVehicle || isVessel || isAircraft;
}

/**
 * Maps PPMS property details to database schema.
 *Automatically fetches surplus release date from Summary dataset (single source of truth).
 * Falls back to Details dataset if Summary is unavailable.
 * 
 * @param diskData - Property details from PPMS Details dataset
 * @param request_id - Request ID to associate with
 * @param justification - Property justification text
 * @param quantity - Requested quantity
 * @returns Property creation attributes for database
 */
export async function mapDiskPropertyToDbSchema(
  diskData: PropertyDetails,
  request_id: number,
  justification: string,
  justificationExtended: string,
  quantity: number
): Promise<PropertyCreationAttributes> {
  // Fetch Summary data for surplus release date 
  const summaryData = await PropertyDataService.getPropertySummaryByICN(diskData.data.itemControlNumber);
  const surplusReleaseDate = summaryData?.surplusReleaseDate || diskData.data.surplusReleaseDate;

  return {
    request_id: request_id,
    property_justification: justification,
    property_justification_extended: justificationExtended,
    property_quantity: quantity,
    property_allocated_quantity: 0,
    property_denied_quantity: 0,
    property_reimbursable: diskData.data.reimbursementCode ? true : false,
    property_control_number: diskData.data.itemControlNumber,
    property_surplus_release_date: new Date(surplusReleaseDate).getTime(),
    property_name: diskData.data.itemName,
    property_type: diskData.data.propertyType,
    property_description: diskData.data.propertyDescription,
    property_original_value: diskData.data.originalAcquisitionCost,
    property_total_value: diskData.data.totalAcquisitionCost,
    property_fair_market_value: diskData.data.fairMarketValue,
    property_disposal_condition: diskData.data.conditionCode,
    property_supply_condition: diskData.data.supplyConditionCode,
    property_demil_condition: diskData.data.demilitarizationCode,
    property_location_address_one: diskData.data.propertyLocation.line1,
    property_location_address_two: diskData.data.propertyLocation.line2,
    property_location_address_three: diskData.data.propertyLocation.line3,
    property_location_city: diskData.data.propertyLocation.city,
    property_location_region_state: diskData.data.propertyLocation.stateCode,
    property_location_postal_code: diskData.data.propertyLocation.zip,
    property_poc_name:
      diskData.data.propertyPOC.firstName + ' ' + diskData.data.propertyPOC.lastName,
    property_poc_phone: diskData.data.propertyPOC.phone.toString(),
    property_poc_email: diskData.data.propertyPOC.email,
    property_poc_email_cc: diskData.data.propertyPOC.ccEmail,
    property_custodian_reporting_agency: diskData.data.agencyBureau,
    property_custodian_name:
      diskData.data.propertyCustodian.firstName +
      ' ' +
      diskData.data.propertyCustodian.lastName,
    property_custodian_phone: diskData.data.propertyCustodian.phone.toString(),
    property_custodian_email: diskData.data.propertyCustodian.email,
    property_custodian_email_cc: diskData.data.propertyCustodian.ccEmail,
    is_cancelled: false,
    is_denied: false,
    is_picked_up: false,
    is_late_cancelled: false,
  };
}
