import { database } from '@/utils/database';
import { Transaction } from 'sequelize';

export async function withTransaction<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    return database.transactionalOperation(operation);
}
