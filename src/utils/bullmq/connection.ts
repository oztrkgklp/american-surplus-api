import { ConnectionOptions } from "bullmq";
import envvars from "@/config/envvars";

export const bullmqConnection: ConnectionOptions = {
    host: envvars.redis.host,
    port: envvars.redis.port,
    password: envvars.redis.password,
    maxRetriesPerRequest: null,
};
