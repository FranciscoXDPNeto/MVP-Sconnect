'use strict';
// Sconnect MVP: HTTP + SQLite nativos do Node.js 22.13+. Sem pacotes externos.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'sconnect.sqlite');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_SECONDS = 60 * 60 * 24 * 3;
const MAX_BODY = 32768;
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK(role IN ('candidate','employer')),
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 education TEXT NOT NULL DEFAULT '',
 experience TEXT NOT NULL DEFAULT '',
 skills TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS employers (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 company TEXT NOT NULL,
 location TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY,
 employer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 requirements TEXT NOT NULL,
 location TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('Efetivo','Temporário','Estágio')),
 salary TEXT NOT NULL DEFAULT 'A combinar',
 status TEXT NOT NULL DEFAULT 'Aberta' CHECK(status IN ('Aberta','Encerrada')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status,created_at);
CREATE INDEX IF NOT EXISTS ix_jobs_employer ON jobs(employer_id);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'Em análise' CHECK(status IN ('Em análise','Entrevista','Não selecionado')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(job_id,candidate_id)
);
CREATE INDEX IF NOT EXISTS ix_apps_candidate ON applications(candidate_id);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf_token TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_expiry ON sessions(expires_at);
`);

function dbGet(sql, ...params) { return db.prepare(sql).get(...params) || null; }
function dbAll(sql, ...params) { return db.prepare(sql).all(...params); }
function dbRun(sql, ...params) { return db.prepare(sql).run(...params); }
function digest(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex || '', 'hex');
  if (expected.length !== 64) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(expected, actual);
}
function json(res, status, data, extra = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(body);
}
function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function readJSON(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    return Promise.reject(err(415, 'Envie JSON (Content-Type: application/json).'));
  }
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(err(413, 'Dados muito grandes.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          reject(err(400, 'Formato de dados inválido.'));
        } else resolve(parsed);
      } catch { reject(err(400, 'JSON inválido.')); }
    });
    req.on('error', reject);
  });
}
function str(value, label, min, max, optional = false) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw err(400, `${label}: texto obrigatório.`);
  const s = value.trim();
  if (s.length < min || s.length > max) throw err(400, `${label}: informe entre ${min} e ${max} caracteres.`);
  return s;
}
function userView(user) {
  const base = { id: user.id, role: user.role, name: user.name, email: user.email };
  if (user.role === 'candidate') {
    const p = dbGet('SELECT education,experience,skills FROM profiles WHERE user_id=?', user.id);
    return { ...base, education: p?.education || '', experience: p?.experience || '', skills: p?.skills || '' };
  }
  const p = dbGet('SELECT company,location FROM employers WHERE user_id=?', user.id);
  return { ...base, company: p?.company || '', location: p?.location || '' };
}
function getSession(req) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('sconnect_session='));
  if (!cookie) return null;
  const token = cookie.slice('sconnect_session='.length);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = dbGet(`SELECT s.token_hash,s.csrf_token,s.expires_at,u.id,u.role,u.name,u.email
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>?`, digest(token), Date.now());
  return row || null;
}
function authorize(session, role) {
  if (!session) throw err(401, 'É necessário entrar na conta.');
  if (role && session.role !== role) throw err(403, 'Seu perfil não tem permissão.');
  return session;
}
function isSecure(req) { return Boolean(req.socket.encrypted); }
function setSessionCookie(req, res, token, maxAge = SESSION_SECONDS) {
  const secure = isSecure(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sconnect_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}
function loginUser(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  dbRun('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
    digest(token), userId, csrf, Date.now() + SESSION_SECONDS * 1000);
  setSessionCookie(req, res, token);
  const user = dbGet('SELECT id,role,name,email FROM users WHERE id=?', userId);
  json(res, 200, { user: userView(user), csrf });
}
// Limite simples local por IP; proteção preliminar para desenvolvimento/homologação.
const attempts = new Map();
function limitLogin(req) {
  const now = Date.now();
  const ip = req.socket.remoteAddress || 'unknown';
  const prev = attempts.get(ip) || [];
  const recent = prev.filter(t => t > now - 15 * 60 * 1000);
  if (recent.length >= 15) throw err(429, 'Muitas tentativas. Aguarde 15 minutos.');
  recent.push(now);
  attempts.set(ip, recent);
}
function jobDetail(row) {
  return { id: row.id, title: row.title, description: row.description, requirements: row.requirements,
    location: row.location, type: row.type, salary: row.salary, status: row.status,
    company: row.company, createdAt: row.created_at };
}
const JOB_SELECT = `SELECT j.*,e.company FROM jobs j JOIN employers e ON e.user_id=j.employer_id`;
function readJobForm(data) {
  const type = str(data.type, 'Tipo', 3, 20);
  if (!['Efetivo', 'Temporário', 'Estágio'].includes(type)) throw err(400, 'Tipo de contrato inválido.');
  return {
    title: str(data.title, 'Cargo', 3, 100), description: str(data.description, 'Descrição', 10, 2000),
    requirements: str(data.requirements, 'Requisitos', 3, 1200), location: str(data.location, 'Localização', 3, 120),
    type, salary: str(data.salary ?? 'A combinar', 'Remuneração', 1, 90)
  };
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return; // CLI e testes podem não enviar Origin.
  const expected = `${isSecure(req) ? 'https' : 'http'}://${req.headers.host}`;
  if (origin !== expected) throw err(403, 'Origem não permitida.');
}
const STATIC_FILES = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/index.html': ['index.html','text/html; charset=utf-8'],
  '/style.css': ['style.css','text/css; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
};
async function handler(req, res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) {
      const item = STATIC_FILES[pathname];
      if (!item || req.method !== 'GET') throw err(404, 'Página não encontrada.');
      const file = fs.readFileSync(path.join(ROOT, 'public', item[0]));
      res.writeHead(200, { 'Content-Type': item[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(file);
      return;
    }
    const session = getSession(req);
    if (!['GET','HEAD'].includes(req.method)) {
      checkOrigin(req);
      if (session && req.headers['x-csrf-token'] !== session.csrf_token) throw err(403, 'Sessão inválida. Atualize a página.');
    }
    const route = `${req.method} ${pathname}`;
    if (route === 'GET /api/auth/me') {
      return json(res, 200, session ? { user: userView(session), csrf: session.csrf_token } : { user: null, csrf: null });
    }
    if (route === 'POST /api/auth/register') {
      limitLogin(req);
      const body = await readJSON(req);
      const role = body.role;
      if (!['candidate','employer'].includes(role)) throw err(400, 'Tipo de conta inválido.');
      const name = str(body.name, 'Nome', 3, 90);
      const email = str(body.email, 'E-mail', 5, 160).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, 'E-mail inválido.');
      const password = str(body.password, 'Senha', 8, 100);
      const company = role === 'employer' ? str(body.company, 'Empresa', 2, 120) : null;
      const location = role === 'employer' ? str(body.location, 'Localização', 3, 120) : null;
      if (dbGet('SELECT id FROM users WHERE email=?', email)) throw err(409, 'E-mail já cadastrado.');
      const id = crypto.randomUUID();
      try {
        db.exec('BEGIN IMMEDIATE');
        dbRun('INSERT INTO users(id,role,name,email,password_hash) VALUES(?,?,?,?,?)', id, role, name, email, passwordHash(password));
        if (role === 'candidate') dbRun('INSERT INTO profiles(user_id) VALUES(?)', id);
        else dbRun('INSERT INTO employers(user_id,company,location) VALUES(?,?,?)', id, company, location);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); if ((e.code?.includes('CONSTRAINT') || /UNIQUE constraint failed/i.test(e.message))) throw err(409, 'E-mail já cadastrado.'); throw e; }
      return loginUser(req, res, id);
    }
    if (route === 'POST /api/auth/login') {
      limitLogin(req);
      const body = await readJSON(req);
      const email = str(body.email, 'E-mail', 3, 160).toLowerCase();
      const password = str(body.password, 'Senha', 1, 100);
      const user = dbGet('SELECT * FROM users WHERE email=?', email);
      // Derivação também quando o e-mail inexiste, dificultando enumeração por tempo.
      const fallback = 'scrypt$00112233445566778899aabbccddeeff$' + '0'.repeat(128);
      const valid = verifyPassword(password, user?.password_hash || fallback);
      if (!user || !valid) throw err(401, 'E-mail ou senha incorretos.');
      return loginUser(req, res, user.id);
    }
    if (route === 'POST /api/auth/logout') {
      authorize(session);
      dbRun('DELETE FROM sessions WHERE token_hash=?', session.token_hash);
      setSessionCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }
    if (route === 'GET /api/profile') return json(res, 200, { profile: userView(authorize(session, 'candidate')) });
    if (route === 'PUT /api/profile') {
      authorize(session, 'candidate');
      const b = await readJSON(req);
      const name = str(b.name, 'Nome', 3, 90);
      const education = str(b.education ?? '', 'Formação', 0, 150);
      const experience = str(b.experience ?? '', 'Experiência', 0, 1500);
      const skills = str(b.skills ?? '', 'Habilidades', 0, 800);
      db.exec('BEGIN IMMEDIATE');
      try {
        dbRun('UPDATE users SET name=? WHERE id=?', name, session.id);
        dbRun('UPDATE profiles SET education=?,experience=?,skills=? WHERE user_id=?', education, experience, skills, session.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { profile: userView({ ...session, name }) });
    }
    if (route === 'GET /api/employer') return json(res, 200, { employer: userView(authorize(session, 'employer')) });
    if (route === 'PUT /api/employer') {
      authorize(session, 'employer');
      const b = await readJSON(req);
      const name = str(b.name, 'Responsável', 3, 90), company = str(b.company, 'Empresa', 2, 120), location = str(b.location, 'Localização', 3, 120);
      db.exec('BEGIN IMMEDIATE');
      try {
        dbRun('UPDATE users SET name=? WHERE id=?', name, session.id);
        dbRun('UPDATE employers SET company=?,location=? WHERE user_id=?', company, location, session.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { employer: userView({ ...session, name }) });
    }
    if (route === 'GET /api/jobs') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
      const type = (url.searchParams.get('type') || '').trim();
      if (type && !['Efetivo', 'Temporário', 'Estágio'].includes(type)) throw err(400, 'Filtro inválido.');
      const rows = dbAll(`${JOB_SELECT} WHERE j.status='Aberta' AND
        (?='' OR (j.title LIKE ? OR e.company LIKE ? OR j.location LIKE ?)) AND (?='' OR j.type=?)
        ORDER BY j.created_at DESC,j.id DESC LIMIT 100`, q, `%${q}%`, `%${q}%`, `%${q}%`, type, type);
      return json(res, 200, { jobs: rows.map(jobDetail) });
    }
    if (route === 'GET /api/employer/jobs') {
      authorize(session, 'employer');
      const rows = dbAll(`${JOB_SELECT} WHERE j.employer_id=? ORDER BY j.created_at DESC`, session.id);
      return json(res, 200, { jobs: rows.map(jobDetail) });
    }
    if (route === 'POST /api/jobs') {
      authorize(session, 'employer');
      const b = readJobForm(await readJSON(req));
      const id = crypto.randomUUID();
      dbRun(`INSERT INTO jobs(id,employer_id,title,description,requirements,location,type,salary)
        VALUES(?,?,?,?,?,?,?,?)`, id, session.id, b.title, b.description, b.requirements, b.location, b.type, b.salary);
      const row = dbGet(`${JOB_SELECT} WHERE j.id=?`, id);
      return json(res, 201, { job: jobDetail(row) });
    }
    const jobMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})$/);
    if (jobMatch) {
      const jobId = jobMatch[1];
      const row = dbGet(`${JOB_SELECT} WHERE j.id=?`, jobId);
      if (!row) throw err(404, 'Vaga não encontrada.');
      if (req.method === 'GET') {
        if (row.status !== 'Aberta' && row.employer_id !== session?.id) throw err(404, 'Vaga não encontrada.');
        return json(res, 200, { job: jobDetail(row) });
      }
      if (req.method === 'PATCH') {
        authorize(session, 'employer');
        if (row.employer_id !== session.id) throw err(403, 'Esta vaga pertence a outra empresa.');
        const raw = await readJSON(req);
        if (Object.keys(raw).length === 1 && Object.hasOwn(raw,'status')) {
          if (!['Aberta','Encerrada'].includes(raw.status)) throw err(400, 'Situação inválida.');
          dbRun('UPDATE jobs SET status=? WHERE id=?', raw.status, jobId);
        } else {
          if (row.status === 'Encerrada') throw err(409, 'Reabra a vaga antes de editar.');
          const b = readJobForm(raw);
          dbRun(`UPDATE jobs SET title=?,description=?,requirements=?,location=?,type=?,salary=? WHERE id=?`,
            b.title,b.description,b.requirements,b.location,b.type,b.salary,jobId);
        }
        const updated = dbGet(`${JOB_SELECT} WHERE j.id=?`, jobId);
        return json(res, 200, { job: jobDetail(updated) });
      }
    }
    const applyMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/apply$/);
    if (applyMatch && req.method === 'POST') {
      authorize(session, 'candidate');
      const job = dbGet('SELECT id,status FROM jobs WHERE id=?', applyMatch[1]);
      if (!job || job.status !== 'Aberta') throw err(404, 'Vaga não disponível.');
      const id = crypto.randomUUID();
      try {
        dbRun('INSERT INTO applications(id,job_id,candidate_id) VALUES(?,?,?)', id, job.id, session.id);
      } catch (e) { if ((e.code?.includes('CONSTRAINT') || /UNIQUE constraint failed/i.test(e.message))) throw err(409, 'Você já se candidatou a esta vaga.'); throw e; }
      return json(res, 201, { id, status: 'Em análise' });
    }
    if (route === 'GET /api/applications/mine') {
      authorize(session, 'candidate');
      const apps = dbAll(`SELECT a.id,a.status,a.created_at,j.title,j.location,e.company,j.id AS job_id
        FROM applications a JOIN jobs j ON j.id=a.job_id JOIN employers e ON e.user_id=j.employer_id
        WHERE a.candidate_id=? ORDER BY a.created_at DESC`, session.id);
      return json(res, 200, { applications: apps });
    }
    const applicationsMatch = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})\/applications$/);
    if (applicationsMatch && req.method === 'GET') {
      authorize(session, 'employer');
      const job = dbGet('SELECT employer_id FROM jobs WHERE id=?', applicationsMatch[1]);
      if (!job) throw err(404, 'Vaga não encontrada.');
      if (job.employer_id !== session.id) throw err(403, 'Acesso negado.');
      const rows = dbAll(`SELECT a.id,a.status,a.created_at,u.name,u.email,p.education,p.experience,p.skills
        FROM applications a JOIN users u ON u.id=a.candidate_id JOIN profiles p ON p.user_id=u.id
        WHERE a.job_id=? ORDER BY a.created_at DESC`, applicationsMatch[1]);
      return json(res, 200, { applications: rows });
    }
    const statusMatch = pathname.match(/^\/api\/applications\/([a-f0-9-]{36})\/status$/);
    if (statusMatch && req.method === 'PATCH') {
      authorize(session, 'employer');
      const app = dbGet('SELECT a.id,j.employer_id FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=?', statusMatch[1]);
      if (!app) throw err(404, 'Candidatura não encontrada.');
      if (app.employer_id !== session.id) throw err(403, 'Acesso negado.');
      const body = await readJSON(req);
      if (!['Em análise','Entrevista','Não selecionado'].includes(body.status)) throw err(400, 'Situação inválida.');
      dbRun('UPDATE applications SET status=? WHERE id=?', body.status, app.id);
      return json(res, 200, { status: body.status });
    }
    throw err(404, 'Rota não encontrada.');
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error('ERRO:', e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Erro interno do servidor.' : e.message });
    else if (!res.writableEnded) res.end();
  }
}
const server = http.createServer(handler);
server.listen(PORT, HOST, () => {
  const address = server.address();
  console.log(`SCONNECT_URL=http://${HOST}:${address.port}`);
  console.log(`Banco: ${DB_PATH}`);
});
process.on('SIGTERM', () => { server.close(() => db.close()); });
