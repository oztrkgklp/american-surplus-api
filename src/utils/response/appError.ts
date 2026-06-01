export class AppError extends Error {
    public statusCode: number;
    public internalMessage?: string;

    constructor(statusCode: number, responseMessage: string, internalMessage?: string) {
        super(responseMessage);
        
        this.statusCode = statusCode;
        this.internalMessage = internalMessage;
        this.name = 'AppError';

        // Ensure the stack trace includes correct error location
        Error.captureStackTrace(this, this.constructor);
    }
}
