import { parseId } from "../../src/utils/validators";
import { AppError } from "../../src/utils/response/appError";

describe("parseId Validator", () => {
    test("parses valid numeric strings", () => {
        expect(parseId("42")).toBe(42);
        expect(parseId("100")).toBe(100);
    });

    test("throws AppError for non-numeric input", () => {
        ["abc", "", "NaN", "undefined"].forEach(input => {
            expect(() => parseId(input)).toThrow(AppError);
        });
    });

    test("throws an AppError with correct status and message", () => {
        expect(() => parseId("invalid")).toThrow(new AppError(400, "Invalid ID format"));
    });
});
