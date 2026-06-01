import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { parseId } from '@/utils/validators';
import { RequestCommentService } from '@/properties/services/comment';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';

export const addCommentToRequest = async (req: Request, res: Response) => {
    try {
        const userId = req.user.id;
        const requestId = parseId(req.params.requestId);
        const { message } = req.body;

        const addedComment = await RequestCommentService.addComment(userId, requestId, message);
        await NotificationFactory.createNotification(NotificationType.COMMENT_ADDED, { requestId, userName: req.user?.name });
        sendSuccess(res, addedComment, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getCommentsForRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const comments = await RequestCommentService.getComments(requestId);
        sendSuccess(res, comments);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const id = parseId(req.params.id);
        await RequestCommentService.deleteComment(id);
        sendSuccess(res, 'Comment deleted successfully');
    } catch (error) {
        sendError(req, res, error);
    }
};

export const updateComment = async (req: Request, res: Response) => {
    try {
        const id = parseId(req.params.id);
        const updates = req.body;
        const updatedComment = await RequestCommentService.updateComment(id, updates);
        sendSuccess(res, updatedComment);
    } catch (error) {
        sendError(req, res, error);
    }
};