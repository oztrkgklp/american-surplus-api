import { Request } from 'express';
import { UAParser } from 'ua-parser-js';

export function getDeviceInfoString(req: Request): string {
    const userAgent = req.headers['user-agent'];
    const uaParser = UAParser(userAgent);

    const browserName = uaParser.browser.name || "Unknown Browser";
    const browserVersion = uaParser.browser.version || "Unknown Browser Version";
    const osName = uaParser.os.name || "Unknown OS";
    const osVersion = uaParser.os.version || "Unknown OS Version";
    const deviceModel = uaParser.device.model || "Unknown Device Model";

    return `${browserName} ${browserVersion}, ${osName} ${osVersion}, ${deviceModel}`;
}
