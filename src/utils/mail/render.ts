import ejs from 'ejs';
import path from 'path';
import fs from 'fs/promises';
import { AppError } from '../response/appError';
import { getAmericanSurplusLogoDataUri } from '@/documents/assets/get-american-surplus-logo';

interface RenderEmailOptions {
    templateName: string;
    data: Record<string, any>;
}

export async function renderEmail({ templateName, data }: RenderEmailOptions): Promise<string> {
    try {
        const baseDir = path.join(__dirname, '../../templates');
        const layoutPath = path.join(baseDir, 'layout.ejs');
        const headerPath = path.join(baseDir, 'partials', 'header.ejs');
        const footerPath = path.join(baseDir, 'partials', 'footer.ejs');
        const contentPath = path.join(baseDir, 'partials/content', `${templateName}.ejs`);

        const emailData = {
            ...data,
            AmericanSurplusLogo: getAmericanSurplusLogoDataUri(),
        };

        // Render each part individually
        const header = await ejs.renderFile(headerPath, emailData, { async: true });
        const content = await ejs.renderFile(contentPath, emailData, { async: true });
        const footer = await ejs.renderFile(footerPath, emailData, { async: true });

        const rendered = await ejs.renderFile(layoutPath, {
            ...emailData,
            header,
            content,
            footer
        }, { async: true });

        return rendered;
    } catch (error) {
        throw new AppError(500, `Unable to render mail ${error}`);
    }
}
