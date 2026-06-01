import User from '@/authn/models/User';
import State from '@/states/models/State';
import Request from '@/properties/models/Request';
import Permission from '@/authz/models/Permission';
import Property from '@/properties/models/Property';
import RolePermission from '@/authz/models/RolePermission';
import Organization from '@/organization/models/Organization';
import OrganizationAddress from '@/organization/models/OrganizationAddress';
import DoneeAccount from '@/organization/models/DoneeAccount';
import OrganizationUser from '@/organization/models/OrganizationUser';
import { getLogger } from '@/utils/logger';
import RequestAttachment from '@/properties/models/RequestAttachment';
import StateDisposalFees from '@/states/models/StateDisposalFees';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import Role from '@/authz/models/Role';
import Scope from '@/authz/models/Scope';
import UserScope from '@/authz/models/UserScope';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import ApplicationLog from '@/eligibility/models/ApplicationLogs.entity';
import Application from '@/eligibility/models/Application.entity';
import Form from '@/eligibility/models/Form.entity';
import ApplicationAttachment from '@/eligibility/models/ApplicationAttachment.entity';
import StateFormRequirement from '@/eligibility/models/StateFormRequirement.entity';
import OrganizationInvitation from '@/organization/models/OrganizationInvitation.entity';
import HaoRoleInvitation from '@/organization/models/HaoRoleInvitation.entity';
import SaspInvitation from '@/sasp/models/SaspInvitations.entity';
import SaspAuditLog from '../sasp/models/SaspAuditLogs.entity';
import Notification from '@/notifications/models/Notification.entity';
import PasswordResetToken from '@/authn/models/PasswordResetToken.entity';
import InvoiceConfig from '@/documents/models/InvoiceConfig.entity';
import Invoice from '@/documents/models/Invoice.entity';
import InvoiceActivityLog from '@/documents/models/InvoiceActivityLogs.entity';
import LogisticsPacket from '@/documents/models/LogisticsPacket.entity';
import Sf97Packet from '@/documents/models/Sf97Packet.entity';
import Compliance from '@/compliance-utilization/models/Compliance.entity';
import ComplianceActivityLog from '@/compliance-utilization/models/ComplianceActivityLogs.entity';
import ComplianceAttachment from '@/compliance-utilization/models/ComplianceAttachment.entity';
import StateAmericanSurplusFees from '@/states/models/StateAmericanSurplusFees.entity';
import ReconciliationReport from '@/documents/models/ReconciliationReport.entity';
import Sba8aCertification from '@/organization/models/Sba8aCertification.entity';
import WantListKeyword from '@/want-list/models/WantListKeyword.entity';
import WantListMatch from '@/want-list/models/WantListMatch.entity';
import WantListMatchHistory from '@/want-list/models/WantListMatchHistory.entity';
import Report from '@/reports/models/Report.entity';
import Mapping3040 from '@/reports/models/Mapping3040.entity';
import ReportLog from '@/reports/models/ReportLog.entity';

const logger = getLogger('Sequelize');

/**
 * Sets up Sequelize model associations.
 */
export const setupAssociations = () => {
  logger.info('Setting up Sequelize associations...');

  // Organization → OrganizationUser
  Organization.hasMany(OrganizationUser, { foreignKey: 'organizationId', as: 'members' });
  OrganizationUser.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  // Organization → DoneeAccount
  Organization.hasMany(DoneeAccount, { foreignKey: 'organizationId', as: 'donee_accounts' });
  DoneeAccount.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

  Organization.hasMany(OrganizationAddress, { foreignKey: 'organization_id', as: 'organization_addresses' });
  OrganizationAddress.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

  // DoneeAccount → Request
  DoneeAccount.hasMany(Request, { foreignKey: 'donee_account', as: 'requests' });
  Request.belongsTo(DoneeAccount, { foreignKey: 'donee_account', as: 'doneeAccount' });

  // Request → Property
  Request.hasMany(Property, { foreignKey: 'request_id', as: 'properties' });
  Property.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // Request → RequestAttachment
  Request.hasMany(RequestAttachment, { foreignKey: 'request_id', as: 'attachments' });
  RequestAttachment.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // Request → User
  Request.belongsTo(User, { foreignKey: 'requestor', as: 'requestorUser' });
  User.hasMany(Request, { foreignKey: 'requestor', as: 'requests' });

  // DoneeAccount → State
  DoneeAccount.belongsTo(State, { foreignKey: 'stateId', as: 'state' });
  State.hasMany(DoneeAccount, { foreignKey: 'stateId', as: 'doneeAccounts' });

  // RequestAttachment → User (created_by)
  RequestAttachment.belongsTo(User, { foreignKey: 'created_by', as: 'createdByUser', });

  // RequestAttachment → User (updated_by)
  RequestAttachment.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedByUser', });

  // State → StateDisposalFees
  StateDisposalFees.belongsTo(State, { foreignKey: 'stateId', as: 'state' });
  State.hasMany(StateDisposalFees, { foreignKey: 'stateId', as: 'stateDisposalFees' });

  // ReconciliationReport ↔ State
  State.hasMany(ReconciliationReport, { foreignKey: 'state_id', as: 'reconciliationReports' });
  ReconciliationReport.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // DisposalCondition → StateDisposalFees
  StateDisposalFees.belongsTo(DisposalCondition, { foreignKey: 'disposalConditionId', as: 'disposalCondition' });
  DisposalCondition.hasMany(StateDisposalFees, { foreignKey: 'disposalConditionId', as: 'stateDisposalFees' });

  // State → StateAmericanSurplusFees
  StateAmericanSurplusFees.belongsTo(State, { foreignKey: 'state_id', as: 'state' });
  State.hasMany(StateAmericanSurplusFees, { foreignKey: 'state_id', as: 'stateAmericanSurplusFees' });

  // DisposalCondition → StateAmericanSurplusFees
  StateAmericanSurplusFees.belongsTo(DisposalCondition, { foreignKey: 'disposal_condition_id', as: 'disposalCondition' });
  DisposalCondition.hasMany(StateAmericanSurplusFees, { foreignKey: 'disposal_condition_id', as: 'stateAmericanSurplusFees' });

  // SaspUser → State (N:1)
  SaspUser.belongsTo(State, { foreignKey: 'stateId', as: 'state' });
  State.hasMany(SaspUser, { foreignKey: 'stateId', as: 'saspUsers' });

  // SaspUser → State
  SaspUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasOne(SaspUser, { foreignKey: 'userId', as: 'saspUser' });






  // -------------------------------  RBAC RELATIONS  -----------------------------------

  // ------------ RELATION BETWEEN SCOPE AND USER SCOPE ----------------
  Scope.hasMany(UserScope, { foreignKey: 'scope_id', as: 'userScopes' });
  UserScope.belongsTo(Scope, { foreignKey: 'scope_id', as: 'scope' });

  // ------------ RELATION BETWEEN USERS AND USER SCOPE ----------------
  User.hasMany(UserScope, { foreignKey: 'user_id', as: 'userScopes' });
  UserScope.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  OrganizationUser.hasOne(UserScope, { foreignKey: 'organization_user_id', as: 'userScope' });
  UserScope.belongsTo(OrganizationUser, { foreignKey: 'organization_user_id', as: 'organizationUser' });

  SaspUser.hasOne(UserScope, { foreignKey: 'sasp_user_id', as: 'userScope' });
  UserScope.belongsTo(SaspUser, { foreignKey: 'sasp_user_id', as: 'saspUser' });

  DoneeAccount.hasOne(UserScope, { foreignKey: 'donee_account_id', as: 'userScope' });
  UserScope.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  Role.hasMany(UserScope, { foreignKey: 'role_id', as: 'userScopes' });
  UserScope.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  // -------  ROLE AND PERMISSION  RELATION
  Role.hasMany(RolePermission, { foreignKey: 'role_id', as: 'rolePermissions' });
  RolePermission.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  RolePermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'Permission' });
  Permission.hasMany(RolePermission, { foreignKey: 'permission_id', as: 'rolePermissions' });



  


  // -------------------- ELIGIBILITY RELATIONS ------------------------

  // Organization ↔ Application
  Organization.hasMany(Application, { foreignKey: 'organization_id', as: 'applications' });
  Application.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

  // DoneeAccount ↔ Application
  DoneeAccount.hasOne(Application, { foreignKey: 'donee_account_id', as: 'application' });
  Application.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // State ↔ Application
  State.hasMany(Application, { foreignKey: 'state_id', as: 'applications' });
  Application.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // User ↔ Application
  User.hasMany(Application, { foreignKey: 'created_by', as: 'applications' });
  Application.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

  // User ↔ Application
  User.hasMany(Application, { foreignKey: 'approved_by', as: 'approvedApplications' });
  Application.belongsTo(User, { foreignKey: 'approved_by', as: 'approvedBy' });

  // Application ↔ ApplicationForm
  Application.hasMany(ApplicationForm, { foreignKey: 'application_id', as: 'applicationForms' });
  ApplicationForm.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

  // ApplicationForm ↔ Form
  Form.hasMany(ApplicationForm, { foreignKey: 'form_id', as: 'applicationForms' });
  ApplicationForm.belongsTo(Form, { foreignKey: 'form_id', as: 'form' });

  // ApplicationForm ↔ ApplicationAttachment
  ApplicationForm.hasMany(ApplicationAttachment, { foreignKey: 'application_form_id', as: 'attachments' });
  ApplicationAttachment.belongsTo(ApplicationForm, { foreignKey: 'application_form_id', as: 'applicationForm' });

  // Application ↔ ApplicationLog
  Application.hasMany(ApplicationLog, { foreignKey: 'application_id', as: 'logs' });
  ApplicationLog.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

  // ApplicationLog ↔ User (actor)
  ApplicationLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  User.hasMany(ApplicationLog, { foreignKey: 'user_id', as: 'applicationLogs' });

  //State -> StateFormRequirement
  StateFormRequirement.belongsTo(State, { foreignKey: 'state_id', targetKey: 'stateId', as: 'state' });
  State.hasMany(StateFormRequirement, { foreignKey: 'state_id', sourceKey: 'stateId', as: 'formRequirements' });

  //Form -> StateFormRequirement
  StateFormRequirement.belongsTo(Form, { foreignKey: 'form_id', as: 'form' });
  Form.hasMany(StateFormRequirement, { foreignKey: 'form_id', as: 'stateRequirements' });





  // ----------------------------- ORGANIZATION MANAGEMENT -------------------------------------

  User.hasMany(OrganizationUser, { foreignKey: 'userId', as: 'organizationLinks' });
  OrganizationUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User ↔ OrganizationInvitation (sender)
  User.hasMany(OrganizationInvitation, { foreignKey: 'invited_by', as: 'invitationsSent' });
  OrganizationInvitation.belongsTo(User, { foreignKey: 'invited_by', as: 'invitationSender' });

  // User ↔ OrganizationInvitation (receiver)
  User.hasMany(OrganizationInvitation, { foreignKey: 'invited_user_id', as: 'invitationsReceived' });
  OrganizationInvitation.belongsTo(User, { foreignKey: 'invited_user_id', as: 'invitationReceiver' });

  //  Role ↔ OrganizationInvitation
  Role.hasMany(OrganizationInvitation, { foreignKey: 'role_id', as: 'organizationInvitations' });
  OrganizationInvitation.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  // Organization ↔ OrganizationInvitation
  Organization.hasMany(OrganizationInvitation, { foreignKey: 'organization_id', as: 'organizationInvitations' });
  OrganizationInvitation.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

  // User ↔ SaspAuditLog
  User.hasMany(SaspAuditLog, { foreignKey: 'activator', as: 'auditLogs' });
  SaspAuditLog.belongsTo(User, { foreignKey: 'activator', as: 'user' });

  // State ↔ SaspAuditLog
  State.hasMany(SaspAuditLog, { foreignKey: 'state_id', as: 'saspAuditLogs' });
  SaspAuditLog.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // InvoiceActivityLog ↔ Invoice
  Invoice.hasMany(InvoiceActivityLog, { foreignKey: 'invoice_id', as: 'invoiceActivityLogs' });
  InvoiceActivityLog.belongsTo(Invoice, { foreignKey: 'invoice_id', as: 'invoice' });

  // InvoiceActivityLog ↔ User
  User.hasMany(InvoiceActivityLog, { foreignKey: 'activator', as: 'invoiceActivityLogs', constraints: false });
  InvoiceActivityLog.belongsTo(User, { foreignKey: 'activator', as: 'user', constraints: false });





  // ----------------------------- SASP USER MANAGEMENT -------------------------------------

  // User ↔ SaspInvitation (sender)
  User.hasMany(SaspInvitation, { foreignKey: 'invited_by', as: 'saspInvitationsSent' });
  SaspInvitation.belongsTo(User, { foreignKey: 'invited_by', as: 'saspInvitationSender' });

  // User ↔ SaspInvitation (receiver)
  User.hasMany(SaspInvitation, { foreignKey: 'invited_user_id', as: 'saspInvitationsReceived' });
  SaspInvitation.belongsTo(User, { foreignKey: 'invited_user_id', as: 'saspInvitationReceiver' });

  // Role ↔ SaspInvitation
  Role.hasMany(SaspInvitation, { foreignKey: 'role_id', as: 'saspInvitations' });
  SaspInvitation.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  // State ↔ SaspInvitation
  State.hasMany(SaspInvitation, { foreignKey: 'state_id', as: 'saspInvitations' });
  SaspInvitation.belongsTo(State, { foreignKey: 'state_id', as: 'state' });






  // -----------------------------  Notification associations -------------------------------------

  // User ↔ Notifications
  User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
  Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });





  // -----------------------------  PASSWORD RESET TOKEN  -------------------------------------

  //User ↔ PasswordResetToken
  PasswordResetToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  User.hasMany(PasswordResetToken, { foreignKey: 'user_id', as: 'passwordResetTokens' });





  // ------------------------------------- DOCUMENTS ---------------------------------------------------

  // State ↔ InvoiceConfig
  State.hasMany(InvoiceConfig, { foreignKey: 'state_id', as: 'invoiceConfigs' });
  InvoiceConfig.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // Invoice ↔ State
  State.hasMany(Invoice, { foreignKey: 'state_id', as: 'invoices' });
  Invoice.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // Invoice ↔ Donee
  DoneeAccount.hasMany(Invoice, { foreignKey: 'donee_account_id', as: 'invoices' });
  Invoice.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // Invoice ↔ Request
  Request.hasMany(Invoice, { foreignKey: 'request_id', as: 'invoices' });
  Invoice.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // Invoice ↔ RequestAttachment (1:1)
  Invoice.belongsTo(RequestAttachment, { foreignKey: 'attachment_id', as: 'requestAttachment' });
  RequestAttachment.hasOne(Invoice, { foreignKey: 'attachment_id', as: 'invoice' });

  // LogisticsPacket ↔ State
  State.hasMany(LogisticsPacket, { foreignKey: 'state_id', as: 'logisticsPackets' });
  LogisticsPacket.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // LogisticsPacket ↔ Donee
  DoneeAccount.hasMany(LogisticsPacket, { foreignKey: 'donee_account_id', as: 'logisticsPackets' });
  LogisticsPacket.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // LogisticsPacket ↔ Request
  Request.hasMany(LogisticsPacket, { foreignKey: 'request_id', as: 'logisticsPackets' });
  LogisticsPacket.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // LogisticsPacket ↔ RequestAttachment (1:1)
  LogisticsPacket.belongsTo(RequestAttachment, { foreignKey: 'attachment_id', as: 'requestAttachment' });
  RequestAttachment.hasOne(LogisticsPacket, { foreignKey: 'attachment_id', as: 'logisticsPacket' });

  // LogisticsPacket ↔ RequestAttachment (1:1)
  LogisticsPacket.belongsTo(RequestAttachment, { foreignKey: 'loar_attachment_id', as: 'loarAttachment' });
  RequestAttachment.hasOne(LogisticsPacket, { foreignKey: 'loar_attachment_id', as: 'loarAttachment' });

  // LogisticsPacket ↔ User (1:1)
  LogisticsPacket.belongsTo(User, { foreignKey: 'loar_sasp_user_id', as: 'loarSaspUser' });
  User.hasOne(LogisticsPacket, { foreignKey: 'loar_sasp_user_id', as: 'loarSaspUser' });

  // Sf97Packet ↔ State
  State.hasMany(Sf97Packet, { foreignKey: 'state_id', as: 'sf97Packets' });
  Sf97Packet.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // Sf97Packet ↔ DoneeAccount
  DoneeAccount.hasMany(Sf97Packet, { foreignKey: 'donee_account_id', as: 'sf97Packets' });
  Sf97Packet.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // Sf97Packet ↔ Request
  Request.hasMany(Sf97Packet, { foreignKey: 'request_id', as: 'sf97Packets' });
  Sf97Packet.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // Sf97Packet ↔ RequestAttachment (1:1)
  Sf97Packet.belongsTo(RequestAttachment, { foreignKey: 'attachment_id', as: 'requestAttachment' });
  RequestAttachment.hasOne(Sf97Packet, { foreignKey: 'attachment_id', as: 'sf97Packet' });

  // ------------------------------------ COMPLIANCES -------------------------------------------------

  // Compliance ↔ DoneeAccount
  DoneeAccount.hasMany(Compliance, { foreignKey: 'donee_account_id', as: 'compliances' });
  Compliance.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // Compliance ↔ Request
  Request.hasMany(Compliance, { foreignKey: 'request_id', as: 'compliances' });
  Compliance.belongsTo(Request, { foreignKey: 'request_id', as: 'request' });

  // Compliance ↔ Property (1:1)
  Compliance.belongsTo(Property, { foreignKey: 'property_id', as: 'property' });
  Property.hasOne(Compliance, { foreignKey: 'property_id', as: 'compliance' });

  // Compliance ↔ ComplianceActivityLog
  Compliance.hasMany(ComplianceActivityLog, { foreignKey: 'compliance_id', as: 'complianceLogs' });
  ComplianceActivityLog.belongsTo(Compliance, { foreignKey: 'compliance_id', as: 'compliance' });

  // ComplianceActivityLog ↔ User (activator)
  User.hasMany(ComplianceActivityLog, { foreignKey: 'activator', as: 'complianceActivityLogs' });
  ComplianceActivityLog.belongsTo(User, { foreignKey: 'activator', as: 'user' });

  // Compliance ↔ ComplianceAttachment (1:N)
  Compliance.hasMany(ComplianceAttachment, { foreignKey: 'compliance_id', as: 'attachments' });
  ComplianceAttachment.belongsTo(Compliance, { foreignKey: 'compliance_id', as: 'compliance' });



  // ------------------------------------ SBA 8(a) CERTIFICATION -------------------------------------------------

  // DoneeAccount ↔ Sba8aCertification (1:1)
  DoneeAccount.hasOne(Sba8aCertification, { foreignKey: 'donee_account_id', as: 'sba8aCertification' });
  Sba8aCertification.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // Application ↔ Sba8aCertification (1:1)
  Application.hasOne(Sba8aCertification, { foreignKey: 'application_id', as: 'sba8aCertification' });
  Sba8aCertification.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

  // ------------------------------------ WANT LIST -------------------------------------------------

  // DoneeAccount ↔ WantListKeyword
  DoneeAccount.hasMany(WantListKeyword, { foreignKey: 'donee_account_id', as: 'wantListKeywords' });
  WantListKeyword.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // WantListKeyword ↔ WantListMatch
  WantListKeyword.hasMany(WantListMatch, { foreignKey: 'want_list_keyword_id', as: 'matches' });
  WantListMatch.belongsTo(WantListKeyword, { foreignKey: 'want_list_keyword_id', as: 'keyword' });

  // DoneeAccount ↔ WantListMatch
  DoneeAccount.hasMany(WantListMatch, { foreignKey: 'donee_account_id', as: 'wantListMatches' });
  WantListMatch.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // DoneeAccount ↔ WantListMatchHistory
  DoneeAccount.hasMany(WantListMatchHistory, { foreignKey: 'donee_account_id', as: 'wantListMatchHistory' });
  WantListMatchHistory.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // ------------------------------------ REPORTS -------------------------------------------------

  // Report ↔ State
  State.hasMany(Report, { foreignKey: 'state_id', as: 'reports' });
  Report.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // Report ↔ Organization
  Organization.hasMany(Report, { foreignKey: 'organization_id', as: 'reports' });
  Report.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

  // Report ↔ DoneeAccount
  DoneeAccount.hasMany(Report, { foreignKey: 'donee_account_id', as: 'reports' });
  Report.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  // Report ↔ User (created_by)
  User.hasMany(Report, { foreignKey: 'created_by', as: 'reportsCreated' });
  Report.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

  // Report ↔ ReportLog
  Report.hasMany(ReportLog, { foreignKey: 'report_id', as: 'logs' });
  ReportLog.belongsTo(Report, { foreignKey: 'report_id', as: 'report' });

  // ReportLog ↔ User (created_by)
  User.hasMany(ReportLog, { foreignKey: 'created_by', as: 'reportLogs' });
  ReportLog.belongsTo(User, { foreignKey: 'created_by', as: 'user' });

  // Mapping3040 ↔ State
  State.hasMany(Mapping3040, { foreignKey: 'state_id', as: 'mappings3040' });
  Mapping3040.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

  // Mapping3040 ↔ Organization
  Organization.hasMany(Mapping3040, { foreignKey: 'organization_id', as: 'mappings3040' });
  Mapping3040.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });

  // Mapping3040 ↔ DoneeAccount
  DoneeAccount.hasOne(Mapping3040, { foreignKey: 'donee_account_id', as: 'mappings3040' });
  Mapping3040.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });

  Organization.hasMany(HaoRoleInvitation, { foreignKey: 'organization_id', as: 'haoRoleInvitations' });
  HaoRoleInvitation.belongsTo(Organization, { foreignKey: 'organization_id', as: 'organization' });
  DoneeAccount.hasMany(HaoRoleInvitation, { foreignKey: 'donee_account_id', as: 'haoRoleInvitations' });
  HaoRoleInvitation.belongsTo(DoneeAccount, { foreignKey: 'donee_account_id', as: 'doneeAccount' });
  Application.hasMany(HaoRoleInvitation, { foreignKey: 'application_id', as: 'haoRoleInvitations' });
  HaoRoleInvitation.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });
  User.hasMany(HaoRoleInvitation, { foreignKey: 'invited_by_user_id', as: 'haoRoleInvitationsSent' });
  HaoRoleInvitation.belongsTo(User, { foreignKey: 'invited_by_user_id', as: 'invitedBy' });
  User.hasMany(HaoRoleInvitation, { foreignKey: 'new_user_id', as: 'haoRoleInvitationsReceived' });
  HaoRoleInvitation.belongsTo(User, { foreignKey: 'new_user_id', as: 'newUser' });
  User.hasMany(HaoRoleInvitation, { foreignKey: 'invited_user_id', as: 'haoRoleInvitationsForUser' });
  HaoRoleInvitation.belongsTo(User, { foreignKey: 'invited_user_id', as: 'invitedUser' });

  logger.info('Sequelize associations have been set up.');
};
