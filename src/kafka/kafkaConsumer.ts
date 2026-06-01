import { kafka } from '@/kafka/kafkaClient';
import { getLogger } from '@/utils/logger';

const consumers: Array<ReturnType<typeof kafka.consumer>> = [];
const logger = getLogger('KafkaConsumer');

export const createConsumer = (groupId: string) => {
    const consumer = kafka.consumer({ groupId });
    consumers.push(consumer); // Track consumer for cleanup
    return consumer;
};

export const consumeMessages = async (
    topic: string,
    handler: (message: any) => void
): Promise<void> => {
    const groupId = `${topic}-group`;
    const consumer = createConsumer(groupId);

    try {
        await consumer.connect();
        await consumer.subscribe({ topic });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const value = message.value?.toString();
                    if (value) {
                        logger.info(`Message received from topic ${topic}: ${value} | Partition: ${partition} : ${message.offset}`);
                        handler(JSON.parse(value));
                    }
                } catch (error) {
                    logger.error(
                        `Error processing message from topic ${topic}: ${error} | Partition: ${partition} : ${message.offset}`
                    );
                }
            },
        });

        logger.info(`Consumer for topic ${topic} with group ${groupId} is running.`);
    } catch (error) {
        logger.error(`Failed to start consumer for topic ${topic}: ${error}`);
    }
};

// Graceful shutdown logic
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    for (const consumer of consumers) {
        try {
            await consumer.disconnect();
            logger.info('Consumer disconnected successfully.');
        } catch (error) {
            logger.error(`Error disconnecting consumer: ${error}`);
        }
    }
    process.exit(0);
});
