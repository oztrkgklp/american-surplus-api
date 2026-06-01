// import { DataTypes, Model } from 'sequelize';
// import { database } from '@/utils/database';
// import Role from './Role';
// import Scope from './Scope';
// import { number } from 'yup';

// interface UserRoleAttributes {
//     id: number;
//     user_id: string;
//     role_id: number;
// }

// class UserRole extends Model<UserRoleAttributes> implements UserRoleAttributes {
//     public id!: number;
//     public user_id!: string;
//     public role_id!: number;

//     //association
//     public role?: Role

//     public scope?: Scope
// }

// UserRole.init(
//     {
//         id: {
//             type: DataTypes.STRING(36),
//             primaryKey: true,
//             autoIncrement: true,
//         },
//         user_id: {
//             type: DataTypes.STRING(36),
//             primaryKey: false,
//         },
//         role_id: {
//             type: DataTypes.INTEGER,
//             primaryKey: false,
//         },
//     },
//     {
//         sequelize: database.sequelize,
//         tableName: 'user_roles',
//         timestamps: false,
//     }
// );

// export default UserRole;