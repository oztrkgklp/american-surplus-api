import path from 'path';

import User from '@/authn/models/User';
import Request from '@/properties/models/Request';
import Property from '@/properties/models/Property';

import { flattenPdf, generatePdf, updateLoarShipping } from '@/loar/services/loarPdf';
import { DoneeAccountService } from '@/organization/services/donee';

import { StoragePaths } from '@/utils/storage/paths';
import { FileExtension } from '@/utils/storage/fileTypes';
import { fileExists, getFilePath, saveUploadedFile } from '@/utils/storage/fileSystem';

import { PropertyDetails } from '@/ppms/types/propertyDetails';
import { AppError } from '@/utils/response/appError';
import RequestAttachment from '@/properties/models/RequestAttachment';

type LoarContext = {
    requestId: string;
    requestTcn: string;
    doneeAccountId: string;
    organizationId: string;
};

export class LoarService {
    /**
     * Generate a new LOAR document without date and signature.
     * Date and signature will only be added when shipping name is provided.
     */
    static async generateLoar(
        user: User,
        request: Request,
        properties: Property[],
        propertyDetails: PropertyDetails[],
        attachmentDate: Date
    ): Promise<string> {
        // Generate without shipping details - this will exclude date and signature
        const buffer = await generatePdf(user, request, properties, propertyDetails, attachmentDate);
        if (!buffer) throw new AppError(500, "Failed to generate LOAR PDF");

        const flattenedFilePath = await this.saveLoarFile(request, buffer);

        return flattenedFilePath;
    }

    static async saveLoarFile(request: Request, buffer: Buffer): Promise<string> {
        const context = await this.getContextInfo(request);

        // Save editable (raw) version
        const fileName = this.buildFileName(context);
        const fileDirectoryPath = this.buildRequestDirectoryPath(context);
        const filePath = getFilePath(fileDirectoryPath, fileName);
        await this.saveToFileSystem(filePath, buffer);

        return filePath;
    }

    /**
     * Update shipping info in an existing LOAR and add date/signature.
     * This will regenerate the LOAR with shipping name, date, and signature.
     */
    static async updateShipping(
        user: User,
        request: Request,
        properties: Property[],
        propertyDetails: PropertyDetails[],
        shippingName: string,
        loarAttachment: RequestAttachment
    ): Promise<string> {
        // Generate with shipping details - this will include date and signature
        const buffer = await updateLoarShipping(user, request, properties, propertyDetails, shippingName, loarAttachment);
        if (!buffer) throw new AppError(500, "Failed to update LOAR PDF shipping info");

        const context = await this.getContextInfo(request);
        const finalFileDirectory = this.buildRequestDirectoryPath(context);
        const finalFileName = this.buildFileName(context);
        const finalFilePath = getFilePath(finalFileDirectory, finalFileName);
        await this.saveToFileSystem(finalFilePath, buffer);

        return finalFilePath;
    }

    /**
     * Save a buffer to disk at the given path.
     */
    static async saveToFileSystem(filePath: string, buffer: Buffer): Promise<void> {
        const dir = path.dirname(filePath);
        const fileName = path.basename(filePath);

        await saveUploadedFile(buffer, dir, fileName)
    }

    /**
     * Build full file path for LOAR document.
     */
    static buildRequestDirectoryPath(context: LoarContext): string {
        return StoragePaths.private
            .orgs.org(context.organizationId)
            .donees.donee(context.doneeAccountId)
            .requests.request(context.requestId)
            .path;
    }

    /**
     * Helper to build filename for LOAR.
     */
    static buildFileName(context: LoarContext): string {
        const { doneeAccountId, requestTcn } = context;
        return `LOAR_${doneeAccountId}_${requestTcn}.${FileExtension.PDF}`;
    }

    /**
     * Converts a flattened LOAR file path to its corresponding editable version.
     * @param flattenedPath Path to the flattened LOAR PDF.
     * @returns Path to the editable LOAR PDF.
     */
    static getEditableLoarPath = (flattenedPath: string): string => {
        const dir = path.dirname(flattenedPath);
        const file = path.basename(flattenedPath);

        if (file.startsWith('editable_')) {
            return path.join(dir, file); // Already editable
        }

        return path.join(dir, `editable_${file}`);
    };

    /**
     * Extract key request context info.
     */
    static async getContextInfo(request: Request): Promise<LoarContext> {
        if (!request.tcn) throw new AppError(400, "Request TCN is missing");

        const requestId = request.id.toString();
        const doneeAccountId = request.donee_account.toString();
        // TO DO its already returning string so Im deleting toString  
        const organizationId = await DoneeAccountService.getDoneeAccountOrganizationId(doneeAccountId)

        if (!organizationId) throw new AppError(400, "Missing organization ID");

        return { requestId, doneeAccountId, organizationId, requestTcn: request.tcn };
    }
}