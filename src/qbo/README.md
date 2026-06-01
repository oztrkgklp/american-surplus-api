# QuickBooks Online (QBO) Services

A modular QuickBooks Online API integration with separate services for authentication, customers, and invoices.

## Architecture

This new architecture separates concerns into dedicated services:

- **auth**: Handles OAuth authentication and token management
- **customer**: Manages customer CRUD operations
- **invoice**: Handles invoice operations including creation, updates, and PDF generation

## Services

### Auth Service (`QBOAuthService`)

Handles authentication-related operations:

- OAuth URL generation
- Token exchange from authorization code
- Token refresh
- Token revocation
- Authentication status checks

### Customer Service (`QBOCustomerService`)

Manages customer operations:

- Create, read, update, delete customers
- Query customers by various criteria
- Find customers by name or email

### Invoice Service (`QBOInvoiceService`)

Handles invoice operations:

- Create, read, update, delete invoices
- Query invoices
- Send invoices by email
- Generate invoice PDFs
- Find invoices by customer or date range

## Usage

```typescript
import { QBOAuthService, QBOCustomerService, QBOInvoiceService, QuickBooksConfig } from '@/qbo';

const config: QuickBooksConfig = {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    realmId: 'your-realm-id',
    environment: 'sandbox',
    accessToken: 'your-access-token'
};

// Initialize services
const authService = new QBOAuthService(config);
const customerService = new QBOCustomerService(config);
const invoiceService = new QBOInvoiceService(config);

// Use services
const customers = await customerService.getAll();
const invoices = await invoiceService.findByCustomer('customer-id');
```

## Configuration

All services require a `QuickBooksConfig` object with:

- `clientId`: Your QuickBooks app client ID
- `clientSecret`: Your QuickBooks app client secret
- `realmId`: The company ID
- `environment`: 'sandbox' or 'production'
- `accessToken`: Current access token (optional for auth operations)
- `refreshToken`: Refresh token (optional)
- `minorVersion`: API version (default: '65')

## API Reference

Based on QuickBooks Online API v3. See [QuickBooks API Documentation](https://developer.intuit.com/app/developer/qbo/docs/api/accounting) for detailed entity specifications.