import State from "@/states/models/State";

import { cache } from "@/utils/cache";
import { cacheKeys } from "@/utils/cache/keys";
import { AppError } from "@/utils/response/appError";

export class StateService {
    /**
     * Fetch all properties for a specific request.
     * @param requestId - The ID of the request.
     * @param page - The page number for pagination.
     * @param limit - The number of items per page for pagination.
     * @returns A paginated list of properties for the given request.
     * @throws AppError if no properties are found.
     */
    static async getStateById(stateId: string): Promise<State> {
        const stateCache = cacheKeys.state;
        const cacheKey = stateCache.key(stateId);

        const cachedState = await cache.get<State>(cacheKey);

        if (cachedState) {
            return cachedState;
        }

        const state = await State.findByPk(stateId);

        if (!state) {
            throw new AppError(404, "State not found");
        }

        await cache.set(cacheKey, state, stateCache.ttl);
        return state;
    }

    /**
     * Fetch all states from the database.
     * @returns A list of all states.
     */
    static async getStates(): Promise<State[]> {
        const states = await State.findAll();

        if (!states || states.length === 0) {
            throw new AppError(404, "No states found");
        }

        return states;
    }
}