import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import {
    EligibilityApplicationFormStatuses,
    EligibilityApplicationStatuses,
} from '@/enums/eligibilityStatus.enum';

type ApplicationWithForms = Application & { applicationForms?: ApplicationForm[] };

function applicationAllowsOrgInfoEdit(app: ApplicationWithForms): boolean {
    const status = app.status as EligibilityApplicationStatuses;
    const forms = app.applicationForms ?? [];
    const formStatus = (formId: number) =>
        forms.find((f) => f.form_id === formId)?.status as
            | EligibilityApplicationFormStatuses
            | undefined;

    if (status === EligibilityApplicationStatuses.FORM_EXPIRED) {
        return (
            formStatus(1) === EligibilityApplicationFormStatuses.FORM_EXPIRED &&
            formStatus(2) === EligibilityApplicationFormStatuses.FORM_EXPIRED
        );
    }

    return (
        status === EligibilityApplicationStatuses.DRAFT ||
        status === EligibilityApplicationStatuses.REJECTED ||
        status === EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED ||
        status === EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED ||
        status === EligibilityApplicationStatuses.APPLICATION_EXPIRED ||
        status === EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED ||
        status === EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED
    );
}

/**
 * Donee organization profile may be edited only when every application on the org
 * is in an allowed status (no applications ⇒ allowed).
 *
 * Used for Head Authorized Officials only (see OrganizationUserService.getCanEditOrganizationInfoForOrganization).
 */
export function getCanEditOrganizationInfoForApplications(
    applications: ApplicationWithForms[],
): boolean {
    if (!applications.length) return true;
    return applications.every(applicationAllowsOrgInfoEdit);
}
