# Eligibility Application Document Generation

## Overview

This feature generates comprehensive PDF documents for eligibility applications, including all form data, attachments, and required legal text. The document generation process is split into two separate steps:

1. **Document Generation** - Creates the initial document with all form data
2. **Document Signing** - Creates a signed version with digital signature information

## How to Trigger Document Generation

### Step 1: Generate Document

```typescript
import { EligibilityApplicationDocumentService } from '@/eligibility/services/eligibilityApplicationDocument.service';
import DocumentFactory, { DocumentActionType } from '@/documents/services/document-factory.service';

// Method 1: Using the service
const result = await EligibilityApplicationDocumentService.generateApplicationDocument(
    applicationId,
    createdBy,
    transaction
);

// Method 2: Direct DocumentFactory call (requires fetching application first)
const application = await Application.findByPk(applicationId);
const result = await DocumentFactory.handler(
    DocumentActionType.GENERATE_ELIGIBILITY_APPLICATION,
    { application, createdBy },
    transaction
);
```

### Step 2: Sign Document

```typescript
// Method 1: Using the service
const signedResult = await EligibilityApplicationDocumentService.signApplicationDocument(
    applicationId,
    signedBy,
    transaction
);

// Method 2: Direct DocumentFactory call (requires fetching application first)
const application = await Application.findByPk(applicationId);
const signedResult = await DocumentFactory.handler(
    DocumentActionType.SIGN_ELIGIBILITY_APPLICATION,
    { application, signedBy },
    transaction
);
```

## Template Structure

The EJS template (`ELIGIBILITY_APPLICATION.ejs`) includes:

### Header Section
- Official document title and SASP information
- Application ID and submission date
- Organization selection instructions

### Organization Information
- Basic organization details (name, TIN/EIN, contact info)
- Addresses (headquarters, mailing, office location)

### Form Sections
1. **Organizational Identity Legal Profile** - Organization type, addresses, contact information
2. **Public Purpose Primary Program Activity** - Program narrative and activity details
3. **Capacity Oversight Program Funding** - Staffing, facilities, funding sources
4. **Designated Signers Attestations** - Authorized representatives and property needs
5. **Welcome Platform Training** - Training completion status

### Required Documents
- List of all uploaded attachments with descriptions and status

### Legal Sections
- Certification & Agreement Statement
- Single Audit Act
- Sample Restriction Periods
- Nondiscrimination Assurance Statement
- Certification Regarding Debarment, Suspension, and Other Responsibility Matters
- Museum Access Agreement (if applicable)

### Signature Section
- Digital signature line with signer name and date
- "Digitally signed by [Name] on [Date]" footer

## Storage Paths

Documents are stored in the following structure:
```
private/orgs/{organizationId}/applications/{applicationId}/
├── Eligibility_Application_{applicationId}_{date}.pdf
└── Eligibility_Application_Signed_{applicationId}_{date}.pdf
```

## Database Updates

- **Generation**: Updates `applications.pdf_path` with the generated document path
- **Signing**: Updates `applications.pdf_path` with the signed document path

## Error Handling

The service includes comprehensive error handling for:
- Missing organization data
- Invalid application forms
- Template rendering errors
- PDF generation failures
- File storage issues

## Usage Examples

### In Application Submission Flow

```typescript
// When application is submitted
const documentResult = await EligibilityApplicationDocumentService.generateApplicationDocument(
    applicationId,
    submittedBy,
    transaction
);

// Later, when application is approved/signed
const signedDocumentResult = await EligibilityApplicationDocumentService.signApplicationDocument(
    applicationId,
    approvedBy,
    transaction
);
```

### In Controller

```typescript
@Post('/applications/:id/generate-document')
async generateDocument(@Param('id') applicationId: number, @User() user: User) {
    return await EligibilityApplicationDocumentService.generateApplicationDocument(
        applicationId,
        user
    );
}

@Post('/applications/:id/sign-document')
async signDocument(@Param('id') applicationId: number, @User() user: User) {
    return await EligibilityApplicationDocumentService.signApplicationDocument(
        applicationId,
        user
    );
}
```

## Potential Improvements

1. **Email Notifications**: Send notifications when documents are generated/signed
2. **Document Versioning**: Keep multiple versions of documents
3. **Digital Signatures**: Implement actual digital signature validation
4. **Watermarking**: Add watermarks for draft vs signed versions
5. **Audit Trail**: Log all document generation and signing activities
6. **Template Customization**: Allow per-state template customization
7. **Bulk Operations**: Support generating/signing multiple applications at once
