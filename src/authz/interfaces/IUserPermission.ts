export interface IUserPermissions {
    sasp_manage_settings: boolean;
    sasp_manage_sasp_users: boolean;
    sasp_approve_organizations: boolean;
    sasp_view_all_organizations: boolean;
    sasp_view_all_donee_accounts: boolean;
    sasp_view_all_users: boolean;
    sasp_view_all_requests: boolean;
    sasp_manage_all_requests: boolean;
    sasp_generate_request_loar: boolean;
    sasp_generate_request_invoice: boolean;
    view_organization_requests: boolean;
    manage_organization_donee_account: boolean;
    view_organization_info: boolean;
    manage_organization_info: boolean;
    manage_organization_users: boolean;
    manage_donee_account: boolean;
    manage_donee_account_users: boolean;
    manage_requests: boolean;
    attach_files_to_requests: boolean;
}