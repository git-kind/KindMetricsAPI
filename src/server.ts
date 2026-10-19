import { config } from 'dotenv';

const environment = process.env.NODE_ENV ?? 'dev';
if (!['dev', 'qa', 'prod'].includes(environment)) {
	throw new Error('NODE_ENV must be one of: dev, qa, prod');
}

const envPath = `.env-${environment}`;
const envResult = config({ path: envPath });
if (envResult.error) {
	throw new Error(`Unable to load ${envPath}: ${envResult.error.message}`);
}

const { buildApp } = await import('./app.js');
const { databaseService } = await import('./Services/DatabaseService.js');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
const app = await buildApp();
await app.listen({ port, host });
console.info(`API service started at http://${host}:${port}.`);

try {
	await databaseService.verifyConnection();
	console.info('Database connection verified.');
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(
		`Database connection failed (${process.env.MYSQL_HOST ?? '127.0.0.1'}:${process.env.MYSQL_PORT ?? '3306'}/${process.env.MYSQL_DATABASE ?? 'kindmetrics'}): ${message}`,
	);
	process.exit(1);
}
