import dotenv from "dotenv";

dotenv.config();

const environment = process.env.NODE_ENV || "development";
const localElasticsearchMode = environment === "local_development";

export default {
    app: {
        name: process.env.npm_package_name || "api",
        port: process.env.PORT || 3000,
        build: process.env.npm_package_version || "0.0.0",
        environment,
    },
    rateLimiter: {
        enabled: process.env.RATE_LIMITER_ENABLED === "true",
        windowMs: parseInt(process.env.RATE_LIMITER_WINDOW_MS || "60000"),
        maxRequests: parseInt(process.env.RATE_LIMITER_MAX_REQUESTS || "100"),
        standardHeaders: process.env.RATE_LIMITER_STANDARD_HEADERS === "true",
        legacyHeaders: process.env.RATE_LIMITER_LEGACY_HEADERS === "false",
        message: process.env.RATE_LIMITER_MESSAGE || "Too many requests. Please try again later.",
    },
    cors: {
        enabled: process.env.CORS_ENABLED === "true",
        origin: process.env.CORS_ORIGIN || "*",
    },
    kafka: {
        clientId: process.env.KAFKA_CLIENT_ID || "change-kafka-client-id-env-var",
        broker: process.env.KAFKA_BROKER || "localhost:9092",
    },
    db: {
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "",
        port: parseInt(process.env.DB_PORT || "3306"),
        connectionLimit: parseInt(process.env.DB_CONN_LIMIT || "10"),
        ssl: {
            enabled: process.env.DB_USE_SSL === "true",
            caPath: process.env.DB_SSL_CA_PATH || "",
        }
    },
    redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        defaultExpiration: parseInt(process.env.REDIS_DEFAULT_EXPIRATION || "300"),
    },
    auth: {
        nonMfaVerificationEnabled: process.env.NON_MFA_VERIFICATION_ENABLED === "true",
        jwt: {
            accessSecret: process.env.JWT_ACCESS_SECRET,
            refreshSecret: process.env.REFRESH_TOKEN_SECRET,
            accessExpiration: process.env.JWT_ACCESS_EXPIRATION || "30m",
            refreshExpiration: process.env.REFRESH_TOKEN_EXPIRATION || "31m",
        }
    },
    storage: {
        root: process.env.STORAGE_ROOT || "/mnt/american-surplus-files",
        loarTemplateFile: process.env.LOAR_TEMPLATE_FILE || "loar-template.pdf",
    },
    pagination: {
        defaultLimit: parseInt(process.env.DEFAULT_PAGINATION_LIMIT || '10'),
        maxLimit: parseInt(process.env.MAX_PAGINATION_LIMIT || '100'),
    },
    mailer: {
        enabled: process.env.EMAILS_ENABLED !== "false",
        mailbox: process.env.MAIL_BOX,
        whitelistedEmailDomains: process.env.WHITELISTED_EMAIL_DOMAINS?.split(',') || ['gmail.com', 'american-surplus.app'],
    },
    azure: {
        client_id: process.env.AZURE_CLIENT_ID,
        tenant_id: process.env.AZURE_TENANT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
    },
    ui: process.env.UI_URL,
    api: process.env.API_URL,
    migration: {
        key: process.env.MIGRATION_KEY
    },
    features: {
        // Allow decreases/same quantity when PPMS listing (icn.json) is missing
        allowNonIncreaseWithoutPPMS: process.env.ALLOW_NONINCREASE_WITHOUT_PPMS === "true",
    },
    businessRules: {
        pickupEvidenceOACThreshold: Number(process.env.PICKUP_EVIDENCE_OAC_THRESHOLD),
        sba8aDurationDays: Number(process.env.SBA8A_DURATION_DAYS) || 3285, // 9 years
        vetCertDurationDays: Number(process.env.VETCERT_DURATION_DAYS) || 1095, // 3 years
    },
    reconcialition: {
        send_report_email: 'ozturkgokalp000@gmail.com'
    },
    elasticsearch: {
        node: localElasticsearchMode
            ? process.env.LOCAL_ELASTICSEARCH_NODE || "http://localhost:9200"
            : process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
        apiKey: localElasticsearchMode ? undefined : process.env.ELASTICSEARCH_API_KEY,
        ssl: {
            enabled: localElasticsearchMode ? false : process.env.ELASTICSEARCH_SSL_ENABLED === "true",
            rejectUnauthorized: localElasticsearchMode
                ? true
                : process.env.ELASTICSEARCH_SSL_REJECT_UNAUTHORIZED !== "false",
        }
    },
    cdn: {
        fallbackEnabled: process.env.CDN_FALLBACK_ENABLED !== "false",
        baseUrl: process.env.CDN_BASE_URL || "http://localhost:8088",
        timeoutMs: parseInt(process.env.CDN_TIMEOUT_MS || "5000"),
    },
    quickbooks: {
        syncEnabled: process.env.QBO_SYNC_ENABLED === "true",
        clientId: process.env.QUICKBOOKS_CLIENT_ID,
        clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
        environment: (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'Production',
        realmId: process.env.QUICKBOOKS_REALM_ID,
        refreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN,
        accessToken: process.env.QUICKBOOKS_ACCESS_TOKEN,
        minorVersion: process.env.QUICKBOOKS_MINOR_VERSION,
        redirectUri: process.env.QUICKBOOKS_REDIRECT_URI,
        webhookToken: process.env.QBO_WEBHOOK_TOKEN,
    },
    admin: { 
        adminOrgId: process.env.ADMIN_ORG_ID
    },
    wantList: {
        maxKeywords: parseInt(process.env.WANT_LIST_MAX_KEYWORDS || '20'),
        maxKeywordLength: parseInt(process.env.WANT_LIST_MAX_KEYWORD_LENGTH || '50'),
    }
}

