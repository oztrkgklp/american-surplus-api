import { getLogger } from '@/utils/logger';
import { consumeMessages } from '@/kafka/kafkaConsumer';
import { Topics } from '@/kafka/topics';

const logger = getLogger('Kafka');

export const startConsumer = async (): Promise<void> => {
    logger.info('All consumers are running.');
};
