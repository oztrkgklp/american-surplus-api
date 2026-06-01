# Logistics Packet Document Generation

## Overview

The Logistics Packet feature automatically generates a comprehensive document packet for property transfer coordination. This packet consolidates relevant documents from across the donation workflow into a single downloadable PDF, streamlining logistics coordination with a professional, standardized, state-branded document packet.

## What is Included

The Logistics Packet contains:

1. **Bill of Lading (Cover Page)** - Custom SF 123-style logistics cover form with:
   - Transfer control number (TCN)
   - Donee and SASP contact information
   - Property pick-up details (location, date, point of contact)
   - Property listing with specifications
   - Signature lines for SASP rep, Donee, and carrier

2. **LOAR (Letter of Authorization to Remove)** - Authorization document for property removal

3. **SF-97 (Certificate to Obtain Title)** - Vehicle title certificate (only if applicable)

4. **Property Details** - Complete listing of all allocated properties

## When to Use

The Logistics Packet is available after:
- Properties have been allocated to the request
- LOAR has been finalized
- Request is in the final stages of the property allocation process

## How to Generate

### Step 1: Generate Logistics Packet

```typescript
import { LogisticsPacketService } from '@/documents/services/logisticsPacket.service';

// Generate the logistics packet
const result = await LogisticsPacketService.generateLogisticsPacket(
    requestId,
    createdBy,
    transaction
);
```

**API Endpoint:**
```
POST /requests/:requestId/logistics-packet
```

**Prerequisites:**
- Request must have allocated properties
- LOAR document must exist
- User must have SASP permissions

### Step 2: Sign Logistics Packet

```typescript
// Sign the logistics packet
const signedResult = await LogisticsPacketService.signLogisticsPacket(
    requestId,
    requestAttachmentId,
    signedBy,
    transaction
);
```

**API Endpoint:**
```
POST /requests/:requestId/logistics-packet/sign
```

**Body:**
```json
{
  "requestAttachmentId": 123
}
```

## API Endpoints

### Generate Logistics Packet
- **URL:** `POST /requests/:requestId/logistics-packet`
- **Authentication:** Required
- **Authorization:** SASP users only
- **Description:** Creates a new logistics packet document

### Sign Logistics Packet
- **URL:** `POST /requests/:requestId/logistics-packet/sign`
- **Authentication:** Required
- **Authorization:** SASP users only
- **Body:** `{ "requestAttachmentId": number }`
- **Description:** Creates a signed version of the logistics packet

### Get Logistics Packet Info
- **URL:** `GET /requests/:requestId/logistics-packet`
- **Authentication:** Required
- **Authorization:** SASP and Donee users
- **Description:** Returns information about existing logistics packet documents

## Document Structure

### Page 1: Bill of Lading
- Header with "BILL OF LADING / SHIPPING AUTHORIZATION"
- Transfer information (TCN, Request ID, Requestor, Date)
- Donee information (Organization, Contact, Address)
- SASP information (State Agency, Address, Phone)
- Property listing table
- Vehicle detection status
- Document inclusion status
- Signature sections for SASP, Donee, and Carrier

### Page 2: Document Appendix
- List of included documents
- References to LOAR and SF-97 (if applicable)
- Property details summary

## File Naming Convention

- **Generated:** `Logistics_Packet_<TransferNumber>.pdf`
- **Signed:** `Signed_Logistics_Packet_<TransferNumber>.pdf`

## Business Rules

### Eligibility Requirements
1. Request must have allocated properties
2. LOAR document must exist
3. Request must not be cancelled or denied

### Vehicle Detection
- System automatically detects if properties are vehicles
- SF-97 is only included when vehicles are present
- Vehicle detection is based on property type and name

### Document Dependencies
- LOAR is required before logistics packet generation
- SF-97 is optional and only generated for vehicle properties
- All documents are consolidated into a single PDF

## Error Handling

### Common Errors
- **400:** No allocated properties found
- **400:** LOAR document not found
- **404:** Request not found
- **500:** Document generation failed

### Validation
- Request ID must be valid
- User must have appropriate permissions
- All required documents must exist

## Integration Points

### Document Factory
The logistics packet uses the existing `DocumentFactory` service with new action types:
- `GENERATE_LOGISTICS_PACKET`
- `SIGN_LOGISTICS_PACKET`

### Request Attachments
- Creates attachments of type `LogisticsPacket`
- Integrates with existing attachment management system
- Supports both generation and signing workflows

### Property Service
- Fetches allocated properties for the request
- Determines vehicle presence
- Provides property details for document generation

## Security Considerations

### Access Control
- SASP users can generate and sign logistics packets
- Donee users can view logistics packet information
- All operations require authentication

### Data Validation
- Request ownership verification
- Property allocation status validation
- Document existence verification

## Performance Considerations

### Database Queries
- Efficient property fetching with allocation filtering
- Attachment lookup by type and request
- Transaction support for data consistency

### File Generation
- PDF generation using Puppeteer
- Template rendering with EJS
- File storage in organized directory structure

## Monitoring and Logging

### Logging
- All operations are logged with appropriate levels
- Error conditions are captured with context
- Performance metrics are tracked

### Notifications
- Success/failure notifications for users
- Audit trail for document operations
- Integration with existing notification system

## Future Enhancements

### Planned Features
- Email delivery of logistics packets
- Digital signature integration
- Automated vehicle detection improvements
- Multi-language support

### Scalability
- Batch processing for multiple requests
- Caching for frequently accessed data
- Async document generation for large packets

## Troubleshooting

### Common Issues
1. **Document not generating:** Check LOAR existence and property allocation
2. **Missing vehicle information:** Verify property type and description
3. **Permission errors:** Confirm user has SASP access
4. **File not found:** Check storage paths and file permissions

### Debug Information
- Enable debug logging for detailed operation tracking
- Check request and property status
- Verify attachment relationships

## Support

For technical support or questions about the Logistics Packet feature:
- Check the application logs for error details
- Verify all prerequisites are met
- Ensure proper user permissions are configured
- Contact the development team for complex issues
