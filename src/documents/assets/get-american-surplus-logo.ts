import fs from 'fs';
import path from 'path';

let cachedLogoDataUri: string | null = null;

export function getAmericanSurplusLogoDataUri(): string {
  if (cachedLogoDataUri) {
    return cachedLogoDataUri;
  }

  const logoPath = path.join(__dirname, 'american-surplus-logo.svg');
  const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
  cachedLogoDataUri = `data:image/svg+xml;base64,${logoBase64}`;
  return cachedLogoDataUri;
}
