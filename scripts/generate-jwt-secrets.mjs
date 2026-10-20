import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

if (!process.argv.includes('--write')) {
  throw new Error('Pass --write to replace JWT_SECRET in .env.dev, .env.qa, and .env.prod');
}

const environments = ['.env.dev', '.env.qa', '.env.prod'];
const updates = await Promise.all(
  environments.map(async (path) => {
    const content = await readFile(path, 'utf8');
    const matches = content.match(/^JWT_SECRET=.*$/gm) ?? [];

    if (matches.length !== 1) {
      throw new Error(`${path} must contain exactly one JWT_SECRET entry`);
    }

    const secret = randomBytes(32).toString('hex');
    return { path, content: content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`) };
  }),
);

await Promise.all(updates.map(({ path, content }) => writeFile(path, content, 'utf8')));
for (const { path } of updates) {
  console.log(`${path}: JWT_SECRET generated`);
}