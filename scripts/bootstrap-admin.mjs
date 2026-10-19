import argon2 from 'argon2';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ chars)');
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT ?? 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
try {
  const [rows] = await db.execute('SELECT id FROM users WHERE is_platform_admin=1 LIMIT 1');
  if (rows.length) throw new Error('Platform admin already exists; bootstrap is one-time only');
  await db.execute('INSERT INTO users(guid,email,name,password_hash,is_platform_admin) VALUES(?,?,?,?,1)', [randomUUID(),email.toLowerCase(),'Platform Admin',await argon2.hash(password)]);
  console.log('Platform admin created');
} finally { await db.end(); }
