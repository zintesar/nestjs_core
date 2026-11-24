import {Injectable,OnApplicationShutdown} from '@nestjs/common'
import {Consumer,ConsumerRunConfig,ConsumerSubscribeTopic,Kafka} from 'kafkajs'
import { decrypt } from '@helpers/cipher';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const KAFKA_BROKERS = IS_CRD_PLAIN ? process.env.KAFKA_BROKERS : decrypt(process.env.KAFKA_BROKERS)
const isKafkaEnabled = () => process.env.ENABLE_KAFKA === 'true';

//read message from a topic..
@Injectable()
export class ConsumerService implements OnApplicationShutdown {
    private readonly kafka: Kafka | null = null;
    private readonly consumers: Consumer[] = [];

    constructor() {
        if (isKafkaEnabled() && KAFKA_BROKERS) {
            this.kafka = new Kafka({
                brokers: [KAFKA_BROKERS],
            });
        } else {
            console.info('Kafka Consumer is disabled (ENABLE_KAFKA != true).');
        }
    }

    async onApplicationShutdown() {
        for (const consumer of this.consumers) {
            await consumer.disconnect();
        }
    }

    async consume(groupId: string, topic: ConsumerSubscribeTopic, config: ConsumerRunConfig) {
        if (!this.kafka) {
            console.info('Kafka is disabled. Skipping consumer for topic:', topic.topic);
            return;
        }
        const cosumer: Consumer = this.kafka.consumer({ groupId: groupId });
        await cosumer.connect().catch((e) => console.error(e));
        await cosumer.subscribe(topic);
        await cosumer.run(config);
        this.consumers.push(cosumer);
    }
}