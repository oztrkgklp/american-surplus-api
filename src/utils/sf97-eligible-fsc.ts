import type { PropertyDetails } from '@/ppms/types/propertyDetails';
import { isPropertyVehicle } from '@/utils/property';

/** SF-97 applies to all properties classified as vehicles in PPMS. */
export function isSf97EligibleProperty(propertyDetails: PropertyDetails): boolean {
  return isPropertyVehicle(propertyDetails);
}

export type Sf97EligibleAllocatedProperty = {
  property_control_number: string;
  property_name?: string | null;
  property_description?: string | null;
};

export function firstSf97EligibleAllocatedProperty(
  allocatedProperties: Sf97EligibleAllocatedProperty[],
  propertyDetails: PropertyDetails[]
): Sf97EligibleAllocatedProperty | undefined {
  for (const prop of allocatedProperties) {
    const pd = propertyDetails.find((d) => d.data?.itemControlNumber === prop.property_control_number);
    if (pd && isSf97EligibleProperty(pd)) return prop;
  }
  return undefined;
}

export function requestHasSf97EligibleProperty(
  allocatedProperties: Sf97EligibleAllocatedProperty[],
  propertyDetails: PropertyDetails[]
): boolean {
  return firstSf97EligibleAllocatedProperty(allocatedProperties, propertyDetails) !== undefined;
}
