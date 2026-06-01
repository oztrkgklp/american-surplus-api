import envvars from '@/config/envvars';
import path from 'path';

const ROOT = envvars.storage.root;
const PPMS_DATA_ROOT = ROOT;
const PPMS_NEW_SCRAPER_ROOT = ROOT;

export const StoragePaths = {
    root: ROOT,

    conf: path.join(ROOT, 'conf'),
    public: path.join(ROOT, 'public'),
    data_migration: path.join(ROOT, 'sftp-upload', 'data-migration'),

    private: {
        path: path.join(ROOT, 'private'),
        // Organization-level nested structure
        orgs:
        {
            path: path.join(ROOT, 'private', 'orgs'),
            org: (orgId: string) => ({
                path: path.join(ROOT, 'private', 'orgs', orgId),
                applications: {
                    path: path.join(ROOT, 'private', 'orgs', orgId, 'applications'),
                    application: (applicationId: string) => ({
                        path: path.join(ROOT, 'private', 'orgs', orgId, 'applications', applicationId),
                        forms: {
                            path: path.join(ROOT, 'private', 'orgs', orgId, 'applications', applicationId, 'forms'),
                            form: (formId: string) => ({
                                path: path.join(ROOT, 'private', 'orgs', orgId, 'applications', applicationId, 'forms', formId),
                                attachments: path.join(ROOT, 'private', 'orgs', orgId, 'applications', applicationId, 'forms', formId, 'attachments'),
                            }),
                        },
                    }),
                },

                donees: {
                    path: path.join(ROOT, 'private', 'orgs', orgId, 'donees'),
                    donee: (doneeId: string) => ({
                        path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId),
                        requests: {
                            path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'requests'),
                            request: (requestId: string) => ({
                                path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'requests', requestId)
                            })
                        },
                        applications: {
                            path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'applications'),
                            application: (applicationId: string) => ({
                                path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'applications', applicationId),
                                forms: {
                                    path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'applications', applicationId, 'forms'),
                                    form: (formId: string) => ({
                                        path: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'applications', applicationId, 'forms', formId),
                                        attachments: path.join(ROOT, 'private', 'orgs', orgId, 'donees', doneeId, 'applications', applicationId, 'forms', formId, 'attachments'),
                                    }),
                                },
                            }),
                        },
                    }),
                }
            }),
        },

        // SASP-related structure
        sasp: {
            path: path.join(ROOT, 'private', 'sasp'),
            state: (stateId: string) => ({
                path: path.join(ROOT, 'private', 'sasp', stateId),
                eligibilityForms: path.join(ROOT, 'private', 'sasp', stateId, 'eligibility'),
                reports3040: path.join(ROOT, 'private', 'sasp', stateId, '3040Reports'),
                monthlyAllocationsReports: path.join(ROOT, 'private', 'sasp', stateId, 'monthlyAllocationsReports'),
            }),
        },

        system: {
            path: path.join(ROOT, 'private', 'system'),
            loarTemplateFile: {
                path: path.join(ROOT, 'private', 'system', envvars.storage.loarTemplateFile),
            },
        },
    },

    // Property dataset
    propertyData: {
        path: path.join(PPMS_DATA_ROOT),
        details: {
            path: path.join(PPMS_DATA_ROOT, 'detail'),
            property: (icn: string) => ({
                path: path.join(PPMS_DATA_ROOT, 'detail', icn),
            }),
        },
        summary: {
            path: path.join(PPMS_DATA_ROOT, 'summary'),
        },
        invoice: {
            path: path.join(PPMS_DATA_ROOT, 'invoice'),
            export: {
                path: path.join(PPMS_DATA_ROOT, 'invoice', 'export'),
            },
            import: {
                path: path.join(PPMS_DATA_ROOT, 'invoice', 'import'),
            },
            reconciliation: {
                path: path.join(PPMS_DATA_ROOT, 'invoice', 'reconciliation'),
            }
        }
    },

    //INVOICE FOLDER

};

export const newStoragePaths = {
    root: ROOT,

    images: {
        path: path.join(PPMS_NEW_SCRAPER_ROOT, 'images/done'),
        image: (icn: string) => ({
            path: path.join(PPMS_NEW_SCRAPER_ROOT, 'images/done', icn)
        })
    }
}
