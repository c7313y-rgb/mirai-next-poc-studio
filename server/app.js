import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUser, csrfGuard } from './auth.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import teacherRoutes from './routes/teacher.js';
import companyRoutes from './routes/company.js';
import adminRoutes from './routes/admin.js';
import fileRoutes from './routes/files.js';
import learningRoutes from './routes/learning.js';
import { ai } from './ai/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(loadUser);

  app.get('/api/health', (req, res) => res.json({ ok: true, ai: ai().name }));
  app.use('/api', csrfGuard);
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/teacher', teacherRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/learning', learningRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'APIが見つかりません' }));

  const dist = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('client/dist がありません。npm run build を実行してください。'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'サーバーでエラーが発生しました。時間をおいて再度お試しください' });
  });
  return app;
}
