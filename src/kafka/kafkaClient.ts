import { Kafka } from 'kafkajs';
import envvars from '@/config/envvars';

export const kafka = new Kafka({
    clientId: envvars.kafka.clientId, // Client ID from environment variables
    brokers: [envvars.kafka.broker], // Array of broker addresses
});
