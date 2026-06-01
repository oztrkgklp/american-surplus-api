import { Transaction } from 'sequelize';
import RequestComment from '@/properties/models/RequestComment';
import { paginateSequelize } from '@/utils/pagination';
import { AppError } from '@/utils/response/appError';

export class RequestCommentService {
    /**
     * Delete a comment.
     * @param commentId - The ID of the comment.
     * @throws AppError if the comment is not found.
     */
    static async deleteComment(commentId: number) {
        const comment = await RequestComment.findByPk(commentId);
        if (!comment) {
            throw new AppError(404, 'Comment not found');
        }
        await comment.destroy();
    }

    /**
     * Update a comment.
     * @param commentId - The ID of the comment.
     * @param updates - The comment updates.
     * @throws AppError if the comment is not found.
     */
    static async updateComment(commentId: number, updates: Partial<RequestComment>) {
        const comment = await RequestComment.findByPk(commentId);
        if (!comment) {
            throw new AppError(404, 'Comment not found');
        }
        await comment.update(updates);
        return comment;
    }

    /**
     * Fetch a comment by ID.
     * @param commentId - The ID of the comment.
     * @returns The comment.
     * @throws AppError if the comment is not found.
     */
    static async getCommentById(commentId: number) {
        const comment = await RequestComment.findByPk(commentId);
        if (!comment) {
            throw new AppError(404, 'Comment not found');
        }
        return comment;
    }

    /**
     * Fetch all comments for a specific request.
     * @param requestId - The ID of the request.
     * @returns An array of comments.
     * @throws AppError if no comments are found.
     */
    static async getComments(requestId: number, page: number = 1, limit: number = 10) {
        const comments = await paginateSequelize<RequestComment>(RequestComment, page, limit,
            { where: { request_id: requestId } }
        );

        return comments;
    }

    /**
     * Add a comment to a specific request.
     * @param requestId - The ID of the request.
     * @param commentData - The comment data.
     */
    static async addComment(senderUserId: string, requestId: number, message: string, transaction?: Transaction) {
        if(!message) {
            throw new AppError(400, 'Comment content cannot be empty');
        }
        
        return await RequestComment.create({
            request_id: requestId,
            comment_sender: senderUserId,
            comment_content: message
        }, { transaction });
    }
}
