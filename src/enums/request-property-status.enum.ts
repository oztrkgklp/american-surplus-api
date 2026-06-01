export enum RequestStatusEnum {
    PENDING = 'pending',
    DENIED = 'denied',
    CANCELED = 'canceled',
    SUMITTED_TO_GSA = 'submitted_to_gsa',
    PARTIALLY_ALLOCATED = 'partially_allocated',
    ALLOCATED = 'allocated',
    AWATING_PICKUP_APPROVAL = 'awaiting_pickup_approval',
    INVOICE_REQUIRED = 'invoice_required',
    INVOICE_SIGNATURE_REQUIRED = 'invoice_signature_required',
    INVOICE_SIGNED = 'invoice_signed',
    COMPLETED = 'completed',
}

export enum PropertyStatusEnum {
    CANCELED = 'canceled',
    DENIED = 'denied',
    COMPETING = 'competing',
    CANNIBALIZE = 'cannibalize',
    ABANDONN_AND_DESTROY = 'abandon_and_destroy',
    PICKUP_READY = 'pickup_ready',
    PICKUP_EVIDENCE_REQUIRED = 'pickup_evidence_required',
    PICKUP_EVIDENCE_SUBMITTED = 'pickup_evidence_submitted',
    PICKUP_APPROVED = 'pickup_approved',
    IN_SERVICE = 'in_service',
    FULLY_TRANSFERRED = 'fully_transferred',
    SUMITTED_TO_GSA = 'submitted_to_gsa',
}
