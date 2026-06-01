import DocumentFactory, { DocumentActionType } from '@/documents/services/document-factory.service';
import Application from '@/eligibility/models/Application.entity';
import User from '@/authn/models/User';
import { Transaction } from 'sequelize';
import { getLogger } from '@/utils/logger';
import type { EligibilityDocumentSignOptions } from './eligibility.service';

const logger = getLogger('EligibilityApplicationDocument');

export class EligibilityApplicationDocumentService {
    /**
     * Generates an eligibility application document
     * @param applicationId The ID of the application to generate document for
     * @param createdBy The user creating the document
     * @param transaction Optional database transaction
     * @returns Generated document information
     */
    static async generateApplicationDocument(
        applicationId: number,
        createdBy: User,
        transaction?: Transaction
    ) {
        try {
            logger.log('Generating eligibility application document', { applicationId, createdBy: createdBy.id });

            // Fetch the application with all necessary data
            const application = await Application.findByPk(applicationId);
            if (!application) {
                throw new Error(`Application with ID ${applicationId} not found`);
            }

            // Generate the document using DocumentFactory
            const result = await DocumentFactory.handler(
                DocumentActionType.GENERATE_ELIGIBILITY_APPLICATION,
                {
                    application,
                    createdBy
                },
                transaction
            );

            logger.log('Eligibility application document generated successfully', result);
            return result;

        } catch (error) {
            logger.error('Failed to generate eligibility application document', error);
            throw error;
        }
    }

    /**
     * Signs an eligibility application document
     * @param applicationId The ID of the application to sign
     * @param signedBy The user signing the document
     * @param transaction Optional database transaction
     * @returns Signed document information
     */
    static async signApplicationDocument(
        applicationId: number,
        signedBy: User,
        transaction?: Transaction,
        options?: EligibilityDocumentSignOptions,
    ) {
        try {
            logger.log('Signing eligibility application document', { applicationId, signedBy: signedBy.id });

            // Fetch the application with all necessary data
            const application = await Application.findByPk(applicationId);
            if (!application) {
                throw new Error(`Application with ID ${applicationId} not found`);
            }

            // Sign the document using DocumentFactory
            const result = await DocumentFactory.handler(
                DocumentActionType.SIGN_ELIGIBILITY_APPLICATION,
                {
                    application,
                    signedBy,
                    ...(options ? { options } : {}),
                },
                transaction
            );

            logger.log('Eligibility application document signed successfully', result);
            return result;

        } catch (error) {
            logger.error('Failed to sign eligibility application document', error);
            throw error;
        }
    }

    /**
     * Example usage in an application submission flow
     * This would typically be called when an application is submitted
     */
    static async onApplicationSubmitted(applicationId: number, submittedBy: User) {
        try {
            // Generate the application document
            const documentResult = await this.generateApplicationDocument(applicationId, submittedBy) as { documentPath: string, displayName: string };
            
            // You could also save the document reference to the database here
            // or send notifications, etc.
            
            logger.log('Application document generated on submission', {
                applicationId,
                documentPath: documentResult?.documentPath,
                displayName: documentResult?.displayName
            });

            return documentResult;

        } catch (error) {
            logger.error('Failed to generate application document on submission', error);
            throw error;
        }
    }
} 