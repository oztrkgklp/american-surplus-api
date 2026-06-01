import { AppError } from "./response/appError";

/**
 * Helper to validate and parse `id` from the request.
 * @param id - The `id` parameter from the request.
 * @returns The parsed integer `id`.
 * @throws AppError if the `id` is not a valid integer.
 */
export const parseId = (id: string): number => {
    if (!id) {
        throw new AppError(400, "ID is required");
    }

    const parsedId = parseInt(id, 10);

    if (isNaN(parsedId)) {
        throw new AppError(400, "Invalid ID format");
    }

    return parsedId;
};

/**
 * Sanitizes and checks if the updates actually differ from the original model instance.
 * - Removes keys not on the model.
 * - Removes disallowed keys.
 * - Removes keys where value hasn't changed.
 * @param modelInstance - Sequelize model instance (e.g., Request)
 * @param updates - Partial update object to sanitize and check
 * @param allowedFields - Optional list of fields allowed to update
 * @returns true if any meaningful changes remain, false otherwise
 */
export function sanitizeSequelizeUpdates<T extends object>(
    modelInstance: T,
    updates: Partial<T>,
    allowedFields?: (keyof T)[]
): boolean {
    const keysToCheck = Object.keys(updates) as (keyof T)[];

    for (const key of keysToCheck) {
        const value = updates[key];

        // Remove if field is not allowed
        if (allowedFields && !allowedFields.includes(key)) {
            delete updates[key];
            continue;
        }

        // Remove if not a valid model field
        if (!(key in modelInstance)) {
            delete updates[key];
            continue;
        }

        // Remove if value is the same as existing value
        if (modelInstance[key] === value) {
            delete updates[key];
        }
    }

    return Object.keys(updates).length > 0;
}
