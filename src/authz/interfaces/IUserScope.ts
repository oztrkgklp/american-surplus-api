import Scope from "../models/Scope";
import { IUserPermissions } from "./IUserPermission";

export interface IUserScope extends IUserCorperate {
    scope: Scope;
    permissions: IUserPermissions;
}

export interface IUserCorperate {
    id: number;
    organizationId?: string;
    organizationName?: string;
    stateId?: number;
    stateName?: string;
    doneeAccountId?: number;
    doneeAccountName?: string;
    isActive: boolean;
}