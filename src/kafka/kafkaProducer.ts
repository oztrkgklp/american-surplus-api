import { kafka } from '@/kafka/kafkaClient';
import { getLogger } from '@/utils/logger';

const logger = getLogger('KafkaProducer');

export const createProducer = () => {
    return kafka.producer();
};

export const sendMessage = async (
    topic: string,
    messages: { value: string }[]
): Promise<void> => {
    const producer = createProducer();

    try {
        await producer.connect();
        await producer.send({
            topic,
            messages,
        });
        logger.info(`Message sent to topic ${topic}: ${JSON.stringify(messages)}`);
    } catch (error) {
        logger.error(`Failed to send message to topic ${topic}: ${error}`);
    } finally {
        await producer.disconnect();
    }
};
