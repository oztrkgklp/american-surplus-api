import { Model, FindAndCountOptions } from "sequelize";
import { PaginatedResponse } from "@/utils/pagination/interfaces";
import { PaginationMetadata } from "./types";
import envvars from "@/config/envvars";

/**
 * Generic pagination utility for Sequelize models with type safety
 * @param model - The Sequelize model to paginate
 * @param page - The current page number (default: 1)
 * @param limit - The number of items per page (default: 10)
 * @param options - Additional Sequelize query options
 * @returns Paginated data with metadata
 */
export async function paginateSequelize<T extends Model<any, any>>(
    model: { findAndCountAll: (options: FindAndCountOptions) => Promise<{ rows: T[]; count: number }> },
    page: number = 1,
    limit: number = 10,
    options: FindAndCountOptions = {}
): Promise<PaginatedResponse<T>> {
    const enforcedLimit = enforceMaxLimit(limit);
    const offset = (page - 1) * enforcedLimit;
    const { rows, count } = await model.findAndCountAll({
        limit: enforcedLimit,
        offset,
        ...options, // Include additional query filters if provided
    });

    return {
        items: rows, // Keeps type safety for returned models
        pagination: getPaginationMetadata(count, offset, enforcedLimit, page),
    };
}


/**
 * Paginates an in-memory array of items.
 * @param data - The full array of items to paginate.
 * @param page - Current page number (default: 1).
 * @param limit - Items per page (default: 10).
 * @returns A paginated response with metadata.
 */
export function paginateArray<T>(
    data: T[],
    page: number = 1,
    limit: number = 10,
): PaginatedResponse<T> {
    const enforcedLimit = enforceMaxLimit(limit);
    const totalItems = data.length;
    const offset = (page - 1) * enforcedLimit;
    const paginatedData = data.slice(offset, offset + enforcedLimit);

    return {
        items: paginatedData,
        pagination: getPaginationMetadata(totalItems, offset, enforcedLimit, page),
    };
}

/**
 * Limits the number of items per page to a maximum value.
 * @param limit - The number of items per page.
 * @param maxLimit - The maximum number of items per page.
 * @returns The limited number of items per page.
 */
function enforceMaxLimit(limit: number): number {
    const maxLimit = envvars.pagination.maxLimit;
    return Math.min(limit, maxLimit);
}

/**
 * Paginated response with metadata.
 * @returns Pagination metadata.
 */
function getPaginationMetadata(dataLength: number, offset: number, limit: number, page: number): PaginationMetadata {
    return {
        totalItems: dataLength,
        totalPages: Math.ceil(dataLength / limit),
        currentPage: page,
        pageSize: limit,
        hasNextPage: offset + limit < dataLength,
        hasPrevPage: page > 1,
    };
}