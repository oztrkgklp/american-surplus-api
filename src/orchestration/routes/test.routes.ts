import { Router } from "express";
import { manualInvoiceExport, manualReconTrigger, triggerExpiredScreeningDateCron, manualEligibilityWarning, manualEligibilityExpire, manualSba8aWarning, manualSba8aExpire, manualComplianceCheck, manualWantListQueryJobTrigger, manualWantListExpiryTrigger } from "@/orchestration/controllers/test.controller";
const router = Router();

router.post('/invoice/manual-export', manualInvoiceExport);
router.post('/invoice/manual-recon', manualReconTrigger);
router.post('/property/expired-screening-date/manual-trigger', triggerExpiredScreeningDateCron); 
router.post('/eligibility/manual-warning', manualEligibilityWarning);
router.post('/eligibility/manual-expire', manualEligibilityExpire);
router.post('/sba8a/manual-warning', manualSba8aWarning);
router.post('/sba8a/manual-expire', manualSba8aExpire);
router.post('/compliance/manual-check', manualComplianceCheck);
router.post('/manual-wantlist-query-job-trigger', manualWantListQueryJobTrigger);
router.post('/manual-wantlist-expiry-trigger', manualWantListExpiryTrigger);

export default router;
