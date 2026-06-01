export enum FileExtension {
  PDF = 'pdf',
  DOCX = 'docx',
  XLSX = 'xlsx',
  CSV = 'csv',
  TXT = 'txt',
  JPG = 'jpg',
  JPEG = 'jpeg',
  PNG = 'png',
}

export const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
];
