import { UserType } from '@/enums/userType';

export function isSasp(userTypeId: number): boolean {
    return userTypeId === UserType.SASP;
}

export function isDonee(userTypeId: number): boolean {
    return userTypeId === UserType.DONEE;
}

export function getUserTypeName(userTypeId: number): string {
    switch (userTypeId) {
        case UserType.SASP:
            return 'SASP';
        case UserType.DONEE:
            return 'Donee';
        default:
            return 'Unknown';
    }
}
