import Notification from '../models/Notification.entity';

/**
 * NotificationService
 * 
 * Encapsulates all application-level notification logic:
 * - Enqueuing jobs
 * - Reading from the database
 * - Marking as read
 * - Counting unread
 * - Any future delivery channels (e.g., email/SMS)
 */
export default class NotificationService {
    /**
     * Fetch a page of notifications for UI
     * @param userId the user whose notifications to load
     * @param page the page number (1-based)
     * @param limit number of items per page
     */
    static async list(userId: string, page: number = 1, limit: number = 20): Promise<{ items: Notification[]; total: number }> {
        const offset = (page - 1) * limit;
        const [items, total] = await Promise.all([
            Notification.findAll({
                where: { user_id: userId },
                order: [['created_at', 'DESC']],
                limit,
                offset,
            }),
            Notification.count({ where: { user_id: userId } }),
        ]);
        return { items, total };
    }

    /**
     * Mark a single notification as read
     * @param userId owner of the notification
     * @param notificationId the notification record ID
     */
    static async markAsRead(userId: string, notificationId: number) {
        await Notification.update(
            { is_read: true, read_at: new Date() },
            { where: { id: notificationId, user_id: userId } }
        );
    }

    /**
     * Mark all notifications for a user as read
     * @param userId the user whose notifications to update
     */
    static async markAllAsRead(userId: string) {
        await Notification.update(
            { is_read: true, read_at: new Date() },
            { where: { user_id: userId, is_read: false } }
        );
    }

    /**
     * Get the count of unread notifications
     * @param userId the user to count for
     */
    static async countUnread(userId: string): Promise<number> {
        return Notification.count({ where: { user_id: userId, is_read: false } });
    }
}
