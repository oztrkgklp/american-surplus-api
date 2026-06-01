import { Router } from "express";
import { migrate, fixRequest, cleanUpMergedRequest, revertMergedRequest, revertCanonicalRequest, fixRequestManually, importLegacyPropertyData, migrateLegacyPropertyRecord, rejectLegacyPropertyMigration, requestLegacyPropertyMigration, getAllLegacyPropertyData, getAllLegacyPropertyCounts, getLegacyPropertyData, fixMalformedEligibilityApplications, invoiceSchemaUpdate, invoicesDisposalConditionCodeUpdate, fixDeniedPropertiesAndRequestStatuses, migrateSba8aCertificationDate, migrateOrganizationAddresses, generateQboCustomers, generateQboInvoices, markInvoicesPaidAndCompleteRequests, backfill3040Mappings, migrateEligibilityApplicationSignatures, assignPrimaryContactFromHeadWhereMissing } from "../controllers/data-migration.controller";
import { authorizeMigrationSasp } from "../middleware/sasp/authorizeMigration.sasp";
import { authorizeMigrationDonee } from "../middleware/donee/authorizeMigrationRequest.donee";
import { UserPermissionsEnum } from "@/enums/userPermissions.enum";
import { authenticate } from "../../orchestration/middleware/authenticate";
import { authorizeMigrationsDonee } from '../middleware/donee/authorizeMigrationRequests.donee';
import { authorizeMigrationsSasp } from '../middleware/sasp/authorizeMigrations.sasp';

const router = Router();

router.post('/migrate', migrate);
router.post('/requests-fix', fixRequest);
router.post('/requests-fix-manual', fixRequestManually);
router.post('/eligibility/fix-malformed-data', fixMalformedEligibilityApplications)
router.post('/migrate-sba8a-cert-date', migrateSba8aCertificationDate);
router.post('/migrate-organization-addresses', migrateOrganizationAddresses);
router.post('/assign-primary-contact-from-head', assignPrimaryContactFromHeadWhereMissing);

// on success purge the merged request
router.post('/clean-up-merged-requests', cleanUpMergedRequest);

// on fail to revert call this on this order:
router.post('/revert-canonical-requests', revertCanonicalRequest);
router.post('/revert-merged-requests', revertMergedRequest);


// ------------------- legacy properties ----------------------------
router.post('/import-legacy-property-data', importLegacyPropertyData);

router.post(
    '/request-legacy-property-migration/:legacyPropertyId/:doneeAccountId',
    authenticate,
    authorizeMigrationDonee([UserPermissionsEnum.MANAGE_REQUESTS]),
    requestLegacyPropertyMigration
);

router.post(
    '/migrate-legacy-property-record/:legacyPropertyId',
    authenticate,
    authorizeMigrationSasp([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    migrateLegacyPropertyRecord
);

router.post(
    '/reject-legacy-property-migration/:legacyPropertyId',
    authenticate,
    authorizeMigrationSasp([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    rejectLegacyPropertyMigration
);

router.get(
    '/legacy-property-data',
    authenticate,
    authorizeMigrationsSasp([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeMigrationsDonee([UserPermissionsEnum.MANAGE_REQUESTS]),
    getAllLegacyPropertyData
);

router.get(
    '/legacy-property-data/counts',
    authenticate,
    authorizeMigrationsSasp([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeMigrationsDonee([UserPermissionsEnum.MANAGE_REQUESTS]),
    getAllLegacyPropertyCounts
);

router.get(
    '/legacy-property-data/:legacyPropertyId',
    authenticate,
    authorizeMigrationsSasp([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeMigrationsDonee([UserPermissionsEnum.MANAGE_REQUESTS]),
    getLegacyPropertyData
);

router.post('/invoice-schema-update', invoiceSchemaUpdate);
router.post('/invoice-disposal-condition-code-update', invoicesDisposalConditionCodeUpdate);


router.post('/fix-denied-properties-with-request-statuses', fixDeniedPropertiesAndRequestStatuses);
router.post('/backfill-3040-mappings', backfill3040Mappings);


// ------------------------- QBO ----------------------------

router.post('/generate-qbo-customers', generateQboCustomers); // 1
router.post('/invoices/mark-paid-complete-requests', markInvoicesPaidAndCompleteRequests); // 2
router.post('/generate-qbo-invoices', generateQboInvoices); // 3

router.post('/migrate-eligibility-application-signatures', migrateEligibilityApplicationSignatures);



export default router;
