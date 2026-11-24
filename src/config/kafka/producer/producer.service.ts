import { Injectable, OnApplicationShutdown,  OnModuleInit } from '@nestjs/common'
import { Kafka, Producer, ProducerRecord } from 'kafkajs'
import { decrypt } from '@helpers/cipher';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const KAFKA_BROKERS = IS_CRD_PLAIN ? process.env.KAFKA_BROKERS : decrypt(process.env.KAFKA_BROKERS)
const isKafkaEnabled = () => process.env.ENABLE_KAFKA === 'true';

//publish meesaage / write message in a topic..
@Injectable()
export class ProducerService implements OnModuleInit, OnApplicationShutdown {
    private readonly kafka: Kafka | null = null;
    private readonly producer: Producer | null = null;

    constructor() {
        if (isKafkaEnabled() && KAFKA_BROKERS) {
            this.kafka = new Kafka({
                brokers: [KAFKA_BROKERS],
            });
            this.producer = this.kafka.producer();
        } else {
            console.info('Kafka Producer is disabled (ENABLE_KAFKA != true).');
        }
    }

    async onApplicationShutdown() {
        if (this.producer) {
            await this.producer.disconnect();
        }
    }

    async onModuleInit() {
        if (this.producer) {
            await this.producer.connect();
        }
    }

    async produce(record: ProducerRecord) {
        if (!this.producer) {
            console.info('Kafka is disabled. Skipping produce record:', record.topic);
            return;
        }
        await this.producer.send(record);
    }
}