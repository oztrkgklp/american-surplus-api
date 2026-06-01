import { parsePhoneNumber } from 'libphonenumber-js/max';
import { CountryCode } from 'libphonenumber-js/types';

export const formatPhoneNumber = (phoneNumber: string, countryCode: CountryCode, international: boolean): string | undefined => {
    try {
        // Validate phone number
        if (!phoneNumber) {
            return undefined;
        }
        
        const parsedNumber = parsePhoneNumber(phoneNumber, countryCode);

        if (international) {
            return parsedNumber.formatInternational();
        }

        return parsedNumber.formatNational();
    } catch (error) {
        console.error("Error formatting phone number:", error);
        return phoneNumber; // Return the original number if formatting fails
    }
}