import { getGraphClient } from "./graphClient";
import { AppError } from "@/utils/response/appError";
import config from "@/config/envvars";
import { getLogger } from '@/utils/logger';

const logger = getLogger('mailerHelper');

const logInfo = (payload: Record<string, unknown>) => {
  logger.info(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const logError = (payload: Record<string, unknown>) => {
  logger.error(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const areAllDomainsWhitelisted = (emails: string | string[]): boolean => {
  const emailArray = Array.isArray(emails) ? emails : [emails];
  return emailArray.every((email) => {
    const domain = email?.split('@')?.[1];
    return domain && config.mailer.whitelistedEmailDomains.includes(domain);
  });
};

export const sendEmail = async ({
  to,
  cc,
  subject,
  text,
  html,
  attachments,
  emailId,
  queueJobId,
}: {
  to: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  emailId?: string;
  queueJobId?: string | number;
}): Promise<void> => {
  let graphStart = 0;

  try {
    const client = await getGraphClient();

    let toRecipients = [
      {
        emailAddress: {
          address: Array.isArray(to) ? to.join(',') : to,
        },
      },
    ];

    let ccRecipients = cc
      ? [
          {
            emailAddress: {
              address: Array.isArray(cc) ? cc.join(',') : cc,
            },
          },
        ]
      : [];

    if (config.app.environment !== 'production') {
      // Check if all 'to' email domains are whitelisted
      if (!areAllDomainsWhitelisted(to)) {
        toRecipients = [
          {
            emailAddress: {
              address: 'ozturkgokalp000@gmail.com',
            },
          },
        ];
      }

      // Check if all 'cc' email domains are whitelisted
      if (cc && !areAllDomainsWhitelisted(cc)) {
        ccRecipients = [
          {
            emailAddress: {
              address: 'ozturkgokalp000@gmail.com',
            },
          },
        ];
      }
    }

    // Prepare attachments for Graph API
    let graphAttachments: any[] | undefined = undefined;
    if (attachments && attachments.length > 0) {
      graphAttachments = attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentBytes: Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64'),
        contentType: att.contentType || 'application/octet-stream',
      }));
    }

    graphStart = Date.now();
    logInfo({
      event: 'graph_send_start',
      emailId,
      queueJobId,
      recipient: Array.isArray(to) ? to.join(',') : to,
      graph_send_start: graphStart,
    });

    await client.api(`/users/${config.mailer.mailbox}/sendMail`).post({
      message: {
        subject,
        body: {
          contentType: html ? 'HTML' : 'Text',
          content: html || text,
        },
        toRecipients,
        ...(cc && { ccRecipients }),
        ...(graphAttachments && { attachments: graphAttachments }),
      },
      saveToSentItems: 'true',
    });

    const graphResponseAt = Date.now();
    logInfo({
      event: 'graph_send_response',
      emailId,
      queueJobId,
      graph_send_response: graphResponseAt,
      graph_latency_ms: Math.max(0, graphResponseAt - graphStart),
      response_status: 202,
    });
  } catch (err: any) {
    const graphFailedAt = Date.now();
    logError({
      event: 'graph_send_failed',
      emailId,
      queueJobId,
      response_status: err?.statusCode || err?.status || null,
      error: err?.message || String(err),
      stack: err?.stack,
      graph_latency_ms: graphStart ? Math.max(0, graphFailedAt - graphStart) : null,
    });

    console.error(`Failed to send email via Graph API:`, err);
    throw new AppError(500, "Failed to send email", String(err));
  }
};
