import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';
import { Request, Response, NextFunction } from 'express';

/**
 * Enum for permission check modes.
 * 'AND': All permissions must be true.
 * 'OR': At least one permission must be true.
 */
export enum PermissionCheckMode {
    AND = 'AND',
    OR = 'OR'
}

export function checkPermission(
    requiredPermissions: (keyof IUserPermissions)[],
    scopeType: ScopeType,
    scopeIdParam?: string, // e.g., 'organizationId'
    mode: PermissionCheckMode = PermissionCheckMode.AND
) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;

        if (!user?.scopes) {
            return res.status(403).json({ message: 'No scopes found' });
        }

        const scopeId = scopeIdParam ? req.params[scopeIdParam] : null;

        const hasPermission = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((rp) =>
            user.scopes!.some((scope: any) => {
                if (scope.type !== scopeType) return false;

                if (scopeId && scopeType === ScopeType.ORGANIZATION && scope.organizationId !== scopeId) return false;
                if (scopeId && scopeType === ScopeType.DONEE && scope.doneeId !== scopeId) return false;
                if (scopeId && scopeType === ScopeType.SASP && scope.stateId.toString() !== scopeId.toString()) return false;

                return scope.permissions?.[rp];
            })
        );

        if (!hasPermission) {
            return res.status(403).json({ message: 'Permission denied' });
        }

        next();
    };
}
