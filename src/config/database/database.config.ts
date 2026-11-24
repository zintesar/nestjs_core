import { IDatabaseConfig, SequelizeLoggingFunction } from './database.interface';
import 'dotenv/config'
import { winstonLog } from '../winstonLog';
import { decrypt } from '@helpers/cipher';

const IS_CRD_PLAIN = process.env.IS_CRD_PLAIN == 'true' ? true : false
const USE_SQLITE = process.env.DB_CONNECTION === 'sqlite' || process.env.USE_SQLITE === 'true';
const DB_STORAGE = process.env.DB_STORAGE || './sample_db/database.sqlite';

const DB_USER = IS_CRD_PLAIN ? process.env.DB_USER : decrypt(process.env.DB_USER)
const DB_PASS = IS_CRD_PLAIN ? process.env.DB_PASS : decrypt(process.env.DB_PASS)
const DB_HOST = IS_CRD_PLAIN ? process.env.DB_HOST : decrypt(process.env.DB_HOST)
const DB_PORT = IS_CRD_PLAIN ? process.env.DB_PORT : decrypt(process.env.DB_PORT)
const DB_DIALECT = USE_SQLITE ? 'sqlite' : (IS_CRD_PLAIN ? process.env.DB_DIALECT : decrypt(process.env.DB_DIALECT)) || 'postgres';
const DB_NAME_DEVELOPMENT = IS_CRD_PLAIN ? process.env.DB_NAME_DEVELOPMENT : decrypt(process.env.DB_NAME_DEVELOPMENT)
const DB_NAME_TEST = IS_CRD_PLAIN ? process.env.DB_NAME_TEST : decrypt(process.env.DB_NAME_TEST)
const DB_NAME_PRODUCTION = IS_CRD_PLAIN ? process.env.DB_NAME_PRODUCTION : decrypt(process.env.DB_NAME_PRODUCTION)



const sequelizeLogging: SequelizeLoggingFunction = (sql: string, queryObject?: { bind: any }) => {
    const transactionid = queryObject && queryObject['replacements'] ? queryObject['replacements']['transactionid_for_log'] : null;  // Assuming transactionid is set in global context
    if (queryObject && queryObject.bind) {
        // Replace placeholders with actual values
        // console.log('queryObject => ', queryObject)
        const values = queryObject.bind;
        sql = sql.replace(/\$(\d+)/g, (_, index) => {
            const value = values[parseInt(index, 10) - 1];
            return typeof value === 'string' ? `'${value}'` : value;
        });
    }
    winstonLog.log('info', '%o', { message: JSON.stringify(sql), transactionid_for_log: transactionid }, { label: 'Db-Log', transactionid_for_log: transactionid });

}

const baseConfig: any = {
    username: DB_USER,
    password: DB_PASS,
    host: DB_HOST,
    port: +(DB_PORT),
    dialect: DB_DIALECT,
    storage: DB_STORAGE,
    dialectOptions: {
        useUTC: process.env.DB_USE_UTC, // for reading from database
    },
    define: {
        timestamps: false
    },
    pool: {
        max: 40,
        min: 0,
        acquire: 60000,
        idle: 10000
    },
    logging: sequelizeLogging,
};

if (DB_DIALECT !== 'sqlite' && process.env.DB_TIMEZONE) {
    baseConfig.timezone = process.env.DB_TIMEZONE;
}

export const databaseConfig: IDatabaseConfig = {
    development: {
        ...baseConfig,
        database: DB_NAME_DEVELOPMENT,
    },
    test: {
        ...baseConfig,
        database: DB_NAME_TEST,
    },
    production: {
        ...baseConfig,
        database: DB_NAME_PRODUCTION,
    },
};