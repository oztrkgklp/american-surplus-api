import { PaginationParams } from "./paginations.interface";

export function getOffset({ page, limit }: PaginationParams): number {
    return (page - 1) * limit;
}

export function getTotalPages(totalItems: number, limit: number): number {
    return Math.ceil(totalItems / limit);
}

/**
 * Build the full pagination metadata.
 */
export function getPaginationMeta(totalItems: number, { page, limit }: PaginationParams) {
    const totalPages = getTotalPages(totalItems, limit);
    return {
        totalItems,
        totalPages,
        currentPage: page,
        pageSize: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
}