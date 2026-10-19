import mysql from 'mysql2/promise';
import 'dotenv/config';
export const pool = mysql.createPool({ host: process.env.MYSQL_HOST ?? '127.0.0.1', port: Number(process.env.MYSQL_PORT ?? 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE ?? 'kindmetrics', waitForConnections: true, connectionLimit: 10, connectTimeout: 5000, multipleStatements: false });
