import {
  firstSf97EligibleAllocatedProperty,
  isSf97EligibleProperty,
  requestHasSf97EligibleProperty,
} from '@/utils/sf97-eligible-fsc';

describe('isSf97EligibleProperty', () => {
  it('returns true when the PPMS vehicle marker is present and FSC is a vehicle code', () => {
    const detail = { data: { vehicle: { make: 'Ford' }, fscCode: '2310', itemControlNumber: 'ICN1' } } as any;
    expect(isSf97EligibleProperty(detail)).toBe(true);
  });

  it('returns true when the PPMS vessel marker is present and FSC is in the vessel group', () => {
    expect(
      isSf97EligibleProperty({ data: { vessel: { name: 'Boat' }, fscCode: '1910', itemControlNumber: 'ICN2' } } as any),
    ).toBe(true);
  });

  it('returns true when the PPMS aircraft marker is present and FSC is a whole-aircraft code', () => {
    expect(
      isSf97EligibleProperty({
        data: { airCraft: { tailNumber: 'N12345' }, fscCode: '1510', itemControlNumber: 'ICN3' },
      } as any),
    ).toBe(true);
  });

  it('returns false when FSC matches but the corresponding marker is null', () => {
    expect(isSf97EligibleProperty({ data: { vehicle: null, fscCode: '1910', itemControlNumber: 'ICN4' } } as any)).toBe(
      false,
    );
    expect(isSf97EligibleProperty({ data: { vehicle: null, fscCode: '2355', itemControlNumber: 'ICN5' } } as any)).toBe(
      false,
    );
  });

  it('returns false for non-titled property classifications', () => {
    expect(isSf97EligibleProperty({ data: { vehicle: null, fscCode: '2500', itemControlNumber: 'ICN6' } } as any)).toBe(
      false,
    );
  });
});

describe('requestHasSf97EligibleProperty', () => {
  const allocated = [{ property_control_number: 'ICN1' }, { property_control_number: 'ICN2' }];

  it('returns true when an allocated line has a populated vehicle marker with a vehicle FSC', () => {
    const details = [
      { data: { itemControlNumber: 'ICN1', vehicle: null, fscCode: '2500' } },
      { data: { itemControlNumber: 'ICN2', vehicle: { make: 'Ford' }, fscCode: '2320' } },
    ] as any[];
    expect(requestHasSf97EligibleProperty(allocated, details)).toBe(true);
    expect(firstSf97EligibleAllocatedProperty(allocated, details)?.property_control_number).toBe('ICN2');
  });

  it('returns true when an allocated line is a vessel or aircraft with matching marker + FSC', () => {
    const details = [
      { data: { itemControlNumber: 'ICN1', vessel: { name: 'Boat' }, fscCode: '1905' } },
      { data: { itemControlNumber: 'ICN2', airCraft: { tailNumber: 'N1' }, fscCode: '1520' } },
    ] as any[];
    expect(requestHasSf97EligibleProperty(allocated, details)).toBe(true);
  });

  it('returns false when no allocated line has a populated marker with a matching FSC', () => {
    const details = [
      { data: { itemControlNumber: 'ICN1', vehicle: null, fscCode: '2500' } },
      { data: { itemControlNumber: 'ICN2', vehicle: null, fscCode: '2510' } },
    ] as any[];
    expect(requestHasSf97EligibleProperty(allocated, details)).toBe(false);
    expect(firstSf97EligibleAllocatedProperty(allocated, details)).toBeUndefined();
  });
});
