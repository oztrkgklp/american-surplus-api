import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface RequestCommentAttributes {
    comment_id: number;
    comment_sender?: string | null;
    request_id?: number | null;
    comment_content?: string | null;
}

interface RequestCommentCreationAttributes
    extends Optional<RequestCommentAttributes, 'comment_id'> { }

class RequestComment
    extends Model<RequestCommentAttributes, RequestCommentCreationAttributes>
    implements RequestCommentAttributes {
    public comment_id!: number;
    public comment_sender?: string | null;
    public request_id?: number | null;
    public comment_content?: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

RequestComment.init(
    {
        comment_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        comment_sender: {
            type: DataTypes.STRING(36),
            allowNull: true,
        },
        request_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        comment_content: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'request_comments',
        timestamps: true,
    }
);

export default RequestComment;
