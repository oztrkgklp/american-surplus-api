import { DataTypes, Model } from 'sequelize';
import { database } from '@/utils/database';
import { IUserPermissions } from '../interfaces/IUserPermission';
import UserScope from './UserScope';

interface ScopeAttributes {
    scope_id: number;
    type: string;
}

class Scope extends Model<ScopeAttributes> implements ScopeAttributes {
    public scope_id!: number;
    public type!: string;

    // Associations
    public userScopes?: UserScope[];
    
    public permissions?: IUserPermissions;

}

Scope.init(
    {
        scope_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        type: {
            type: DataTypes.STRING,
            primaryKey: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'scopes',
        timestamps: false,
    }
);

export default Scope;
