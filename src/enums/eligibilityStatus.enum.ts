export enum EligibilityApplicationStatuses {
    DRAFT = 'Draft',
    SUBMITTED = 'Submitted',
    IN_REVIEW = 'In_Review',
    APPROVED = 'Approved',
    CHANGE_REQUESTED = 'Change_Requested',
    CHANGES_RETURNED = 'Changes_Returned',
    REJECTED = 'Rejected',
    DENIED = 'Denied',

    FORM_RENEWAL_REQUIRED = 'Form_Renewal_Required', // WARNING STATUS FOR APPLICATION FORM EXPIRY  
    ON_FORM_RENEWAL = 'On_Form_Renewal', // just like submitted (after renewal)
    FORM_RENEWAL_REJECTED = 'Form_Renewal_Rejected',

    APPLICATION_RENEWAL_REQUIRED = 'Application_Renewal_Required', //WARNING STATUS FOR APPLICATION EXPIRY WARNING
    ON_APPLICATION_RENEWAL = 'On_Application_Renewal', // just like submitted (after renewal)
    APPLICATION_RENEWAL_REJECTED = 'Application_Renewal_Rejected',

    FORM_EXPIRED = 'Form_Expired',
    APPLICATION_EXPIRED = 'Application_Expired',
    WAITING_FOR_HAO_SIGNATURE = 'Waiting_For_HAO_Signature',
}

export enum EligibilityApplicationFormStatuses {
    NEW = 'New',
    SIGNED = 'Signed', // just like submitted
    APPROVED = 'Approved',
    EDITS_REQUESTED = 'Edits_Requested',
    EDITS_RETURNED = 'Edits_Returned',
    REJECTED = 'Rejected',
    FORM_EXPIRED = 'Form_Expired',
    FORM_RENEWAL_REQUIRED = 'Form_Renewal_Required',
}


export const EligibilityApplicationStatusLabels: Record<EligibilityApplicationStatuses, string> = {
    [EligibilityApplicationStatuses.DRAFT]: 'Draft',
    [EligibilityApplicationStatuses.SUBMITTED]: 'Submitted',
    [EligibilityApplicationStatuses.IN_REVIEW]: 'In Review',
    [EligibilityApplicationStatuses.APPROVED]: 'Approved',
    [EligibilityApplicationStatuses.CHANGE_REQUESTED]: 'Change Requested',
    [EligibilityApplicationStatuses.CHANGES_RETURNED]: 'Changes Returned',
    [EligibilityApplicationStatuses.REJECTED]: 'Returned',
    [EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED]: 'Form Renewal Returned',
    [EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED]: 'Application Renewal Returned',
    [EligibilityApplicationStatuses.DENIED]: 'Denied',
    [EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED]: 'Form Renewal Required',
    [EligibilityApplicationStatuses.ON_FORM_RENEWAL]: 'On Form Renewal',
    [EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED]: 'Application Renewal Required',
    [EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL]: 'On Application Renewal',
    [EligibilityApplicationStatuses.FORM_EXPIRED]: 'Form Expired',
    [EligibilityApplicationStatuses.APPLICATION_EXPIRED]: 'Application Expired',
    [EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE]: 'Waiting for HAO Signature',
};