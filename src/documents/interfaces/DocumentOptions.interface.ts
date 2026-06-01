import { DocumentTemplateEnum } from "../enums/DocumentTemplate.enum";

export interface IDocumentRenderOptions {
    documentTemplate: DocumentTemplateEnum,
    payload: Record<string, any>;
}
