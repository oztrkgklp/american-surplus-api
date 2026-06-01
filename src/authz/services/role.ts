import Role from '@/authz/models/Role';
import { roleSchema } from '@/authz/schemas/role';
import { AppError } from '@/utils/response/appError';

export class RoleService {
    /**
     * Fetches all roles.
     * @returns An array of all roles.
     */
    static async getRoles(): Promise<Role[]> {
        return await Role.findAll();
    }

    /**
     * Fetches a role by ID.
     * @param roleId - The ID of the role to fetch.
     * @returns The role object.
     * @throws AppError if the role is not found.
     */
    static async getRoleById(roleId: number): Promise<Role> {
        const role = await Role.findByPk(roleId);
        if (!role) {
            throw new AppError(404, 'Role not found');
        }
        return role;
    }

    /**
     * Updates a role by ID.
     * @param roleId - The ID of the role to update.
     * @param updates - Partial updates to the role.
     * @returns The updated role.
     */
    static async updateRole(roleId: number, updates: Partial<Role>): Promise<Role> {
        const role = await this.getRoleById(roleId);
        return await role.update(updates);
    }

    /**
     * Deletes a role by ID.
     * @param roleId - The ID of the role to delete.
     */
    static async deleteRole(roleId: number): Promise<void> {
        const role = await this.getRoleById(roleId);
        await role.destroy();
    }
}
