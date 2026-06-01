import ejs from 'ejs';
import path from 'path';
import fs from 'fs/promises';
import { AppError } from '../response/appError';

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

        // Render each part individually
        const header = await ejs.renderFile(headerPath, data, { async: true });
        const content = await ejs.renderFile(contentPath, data, { async: true });
        const footer = await ejs.renderFile(footerPath, data, { async: true });

        const rendered = await ejs.renderFile(layoutPath, {
            ...data,
            header,
            content,
            footer
        }, { async: true });

        return rendered;
    } catch (error) {
        throw new AppError(500, `Unable to render mail ${error}`);
    }
}
