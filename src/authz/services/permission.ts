import Permission from '@/authz/models/Permission';
import { AppError } from '@/utils/response/appError';

export class PermissionService {
    /**
     * Fetches all permissions from the database.
     * @returns An array of all permissions.
     */
    static async getPermissions(): Promise<Permission[]> {
        try {
            return await Permission.findAll();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Fetches a single permission by its ID.
     * @param permissionId - The ID of the permission to fetch.
     * @returns The permission if found.
     * @throws AppError if the permission is not found.
     */
    static async getPermissionById(permissionId: number): Promise<Permission> {
        try {
            const permission = await Permission.findByPk(permissionId);
            if (!permission) {
                throw new AppError(404, 'Permission not found');
            }
            return permission;
        } catch (error) {
            throw error;
        }
    }
}
