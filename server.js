import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const app = express();
const port = Number(process.env.PORT || 3000);
const sessionDuration = 60 * 60 * 1000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'bethel_sda',
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json());

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(response, token, expiresAt) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `bethel_session=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expiresAt.toUTCString()}${secure}`);
}

function readSessionToken(request) {
  const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) || [];
  return cookies.find((cookie) => cookie.startsWith('bethel_session='))?.slice('bethel_session='.length) || '';
}

async function requireAuth(request, response, next) {
  const token = readSessionToken(request);
  if (!token) return response.status(401).json({ error: 'Authentication required.' });

  const [rows] = await pool.execute(
    `SELECT s.id, s.user_id, s.last_activity_at, s.expires_at
     FROM login_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND u.is_active = TRUE
     LIMIT 1`,
    [hashToken(token)]
  );
  const session = rows[0];
  const now = Date.now();
  if (!session || new Date(session.expires_at).getTime() <= now || now - new Date(session.last_activity_at).getTime() >= sessionDuration) {
    if (session) await pool.execute('DELETE FROM login_sessions WHERE id = ?', [session.id]);
    response.setHeader('Set-Cookie', 'bethel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return response.status(401).json({ error: 'Your session expired. Please log in again.' });
  }

  const expiresAt = new Date(now + sessionDuration);
  await pool.execute('UPDATE login_sessions SET last_activity_at = ?, expires_at = ? WHERE id = ?', [new Date(now), expiresAt, session.id]);
  request.userId = session.user_id;
  next();
}

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const { username, password } = request.body || {};
    if (!username || !password) return response.status(400).json({ error: 'Username and password are required.' });
    const [rows] = await pool.execute('SELECT id, password_hash FROM users WHERE username = ? AND is_active = TRUE LIMIT 1', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ error: 'The username or password is not correct.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + sessionDuration);
    await pool.execute(
      'INSERT INTO login_sessions (id, user_id, token_hash, expires_at, last_activity_at) VALUES (UUID(), ?, ?, ?, ?)',
      [user.id, hashToken(token), expiresAt, new Date()]
    );
    setSessionCookie(response, token, expiresAt);
    response.json({ authenticated: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    const token = readSessionToken(request);
    if (token) await pool.execute('DELETE FROM login_sessions WHERE token_hash = ?', [hashToken(token)]);
    response.setHeader('Set-Cookie', 'bethel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', requireAuth, (request, response) => response.json({ authenticated: true }));

app.get('/api/members', requireAuth, async (request, response, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.category, m.gender, f.name AS family,
              m.marital_status AS maritalStatus, m.married_group AS marriedGroup,
              m.class_name AS className, m.phone, m.created_at AS createdAt
       FROM members m LEFT JOIN families f ON f.id = m.family_id
       ORDER BY m.created_at ASC, m.id ASC`
    );
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/members', requireAuth, async (request, response, next) => {
  try {
    const member = request.body || {};
    const required = ['id', 'name', 'category', 'gender', 'family', 'maritalStatus', 'createdAt'];
    if (required.some((field) => !member[field])) return response.status(400).json({ error: 'Missing required member fields.' });
    const [families] = await pool.execute('SELECT id FROM families WHERE name = ? LIMIT 1', [member.family]);
    if (!families[0]) return response.status(400).json({ error: 'Invalid family.' });
    await pool.execute(
      `INSERT INTO members
       (id, name, category, gender, family_id, marital_status, married_group, class_name, phone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [member.id, member.name, member.category, member.gender, families[0].id, member.maritalStatus, member.marriedGroup || '', member.className || '', member.phone || '', member.createdAt]
    );
    response.status(201).json({ ...member });
  } catch (error) {
    next(error);
  }
});

app.get('/api/attendance', requireAuth, async (request, response, next) => {
  try {
    const [rows] = await pool.query('SELECT member_id AS memberId, attendance_date AS date, status, checked_in_at AS checkedInAt FROM attendance ORDER BY attendance_date DESC, checked_in_at DESC');
    response.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/attendance', requireAuth, async (request, response, next) => {
  try {
    const { memberId, date, status = 'Present', checkedInAt } = request.body || {};
    if (!memberId || !date) return response.status(400).json({ error: 'Member and date are required.' });
    await pool.execute(
      `INSERT INTO attendance (member_id, attendance_date, status, checked_in_at, recorded_by)
       VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), checked_in_at = VALUES(checked_in_at), recorded_by = VALUES(recorded_by)`,
      [memberId, date, status, checkedInAt || null, request.userId]
    );
    response.status(201).json({ memberId, date, status, checkedInAt: checkedInAt || new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get(/.*/, (request, response) => response.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(port, () => console.log(`Bethel server listening on port ${port}`));
