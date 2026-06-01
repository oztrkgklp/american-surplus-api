import * as Yup from 'yup';

/**
 * Validation schema for creating or updating a role.
 * - roleName: Required, string with a max length of 50.
 * - roleDefault: Optional, boolean (defaults to `false`).
 * - userTypeId: Required, integer.
 * - organizationId: Optional, integer or null.
 */
export const roleSchema = Yup.object({
    roleName: Yup.string()
        .required('Role name is required')
        .max(50, 'Role name cannot exceed 50 characters'),
    roleDefault: Yup.boolean().default(false),
    userTypeId: Yup.number()
        .required('User type ID is required')
        .integer('User type ID must be an integer'),
    organizationId: Yup.number()
        .nullable()
        .integer('Organization ID must be an integer'),
});
