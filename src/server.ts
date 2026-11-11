import { config } from 'dotenv';

const environment = process.env.NODE_ENV ?? 'dev';
if (!['dev', 'qa', 'prod'].includes(environment)) {
  throw new Error('NODE_ENV must be one of: dev, qa, prod');
}
process.env.NODE_ENV ??= environment;

const envFiles = {
  dev: '.env.dev',
  qa: '.env.qa',
  prod: '.env.prod',
} as const;
const envPath = envFiles[environment as keyof typeof envFiles];
const envResult = config({ path: envPath });
if (envResult.error) {
  throw new Error(`Unable to load ${envPath}. Confirm it exists (copy .env.example to ${envPath}) and can be read: ${envResult.error.message}`);
}

const { buildApp } = await import('./app.js');
const { databaseService } = await import('./Services/DatabaseService.js');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3001);
const urlHost = ['0.0.0.0', '::'].includes(host) ? 'localhost' : host;
const urlHostFormatted = urlHost.includes(':') ? `[${urlHost}]` : urlHost;
const baseUrl = `http://${urlHostFormatted}:${port}`;
const app = await buildApp();

async function isKindMetricsAlreadyRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === 'object' &&
      body !== null &&
      'success' in body &&
      body.success === true &&
      'data' in body &&
      typeof body.data === 'object' &&
      body.data !== null &&
      'status' in body.data &&
      body.data.status === 'ok'
    );
  } catch {
    return false;
  }
}

try {
  await app.listen({ port, host });
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    if (await isKindMetricsAlreadyRunning()) {
      await app.close();
      console.info(`KindMetrics API is already running at ${baseUrl}; keeping the existing instance.`);
      process.exit(0);
    }
    console.error(`Cannot start API: ${host}:${port} is already in use. Stop the existing instance or choose another PORT.`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API failed to start: ${message}`);
  }
  process.exit(1);
}
console.info(`API service started at http://${host}:${port}.`);

try {
  await databaseService.verifyConnection();
  console.info('Database connection verified.');
  console.info(`Swagger: ${baseUrl}/docs`);
  console.info(`Test endpoint: ${baseUrl}/health`);
  console.info(`API: ${baseUrl}/api/v1`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `API is running, but the database connection failed (${process.env.MYSQL_HOST ?? '127.0.0.1'}:${process.env.MYSQL_PORT ?? '3306'}/${process.env.MYSQL_DATABASE ?? 'kindmetrics'}): ${message}. Database-backed routes will be unavailable until the database is reachable.`,
  );
}
