import { isPropertyVehicle } from '@/utils/property';

describe('isPropertyVehicle', () => {
  describe('vehicle marker', () => {
    it('returns true when vehicle marker is present and FSC is in the vehicle group', () => {
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: '2410' } } as any)).toBe(true);
    });

    it('returns true when vehicle marker is present and FSC is in the vehicle exception set', () => {
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: '1740' } } as any)).toBe(true);
      expect(isPropertyVehicle({ data: { vehicle: {}, fscCode: '2310' } } as any)).toBe(true);
    });

    it('returns false when FSC matches but the vehicle marker is null', () => {
      expect(isPropertyVehicle({ data: { vehicle: null, fscCode: '2410' } } as any)).toBe(false);
      expect(isPropertyVehicle({ data: { vehicle: null, fscCode: '1740' } } as any)).toBe(false);
    });

    it('returns false when vehicle marker is present but FSC is outside the vehicle ranges', () => {
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: '2500' } } as any)).toBe(false);
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: '9999' } } as any)).toBe(false);
    });
  });

  describe('vessel marker', () => {
    it('returns true when vessel marker is present and FSC is in the vessel group (19xx)', () => {
      expect(isPropertyVehicle({ data: { vessel: { name: 'Patrol Boat' }, fscCode: '1905' } } as any)).toBe(true);
      expect(isPropertyVehicle({ data: { vessel: {}, fscCode: '1940' } } as any)).toBe(true);
    });

    it('returns false when FSC matches a vessel group but the vessel marker is null (e.g. floating dock without marker)', () => {
      expect(isPropertyVehicle({ data: { vessel: null, fscCode: '1910' } } as any)).toBe(false);
    });

    it('returns false when vessel marker is present but FSC is outside the vessel group', () => {
      expect(isPropertyVehicle({ data: { vessel: { name: 'Patrol Boat' }, fscCode: '2310' } } as any)).toBe(false);
    });
  });

  describe('aircraft marker', () => {
    it('returns true when aircraft marker is present and FSC is a whole-aircraft code', () => {
      expect(isPropertyVehicle({ data: { airCraft: { tailNumber: 'N12345' }, fscCode: '1510' } } as any)).toBe(true);
      expect(isPropertyVehicle({ data: { airCraft: {}, fscCode: '1520' } } as any)).toBe(true);
      expect(isPropertyVehicle({ data: { airCraft: { tailNumber: 'N12345' }, fscCode: '1540' } } as any)).toBe(true);
      expect(isPropertyVehicle({ data: { airCraft: { tailNumber: 'N12345' }, fscCode: '1550' } } as any)).toBe(true);
    });

    it('returns false for airframe component FSC codes (15xx but not the whole-aircraft list)', () => {
      expect(isPropertyVehicle({ data: { airCraft: { tailNumber: 'N12345' }, fscCode: '1560' } } as any)).toBe(false);
    });

    it('returns false when FSC matches but the aircraft marker is null', () => {
      expect(isPropertyVehicle({ data: { airCraft: null, fscCode: '1510' } } as any)).toBe(false);
    });
  });

  describe('input validation', () => {
    it('returns false when FSC code is missing or invalid', () => {
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: undefined } } as any)).toBe(false);
      expect(isPropertyVehicle({ data: { vehicle: { make: 'Ford' }, fscCode: '123' } } as any)).toBe(false);
    });

    it('returns false when all classification markers are null', () => {
      expect(
        isPropertyVehicle({
          data: { vehicle: null, vessel: null, airCraft: null, fscCode: '2310' },
        } as any),
      ).toBe(false);
    });
  });
});
