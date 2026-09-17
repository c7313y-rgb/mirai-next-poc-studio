import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, client } from './helpers.js';

test('デモ切替は簡易ログイン・ID/PW・QR・既存セッションを一括無効化する',async()=>{
 const{server,base,q}=await bootstrap();
 const{config}=await import('../server/config.js');
 const{hashPassword}=await import('../server/lib/password.js');
 const{sha256}=await import('../server/lib/pseudo.js');
 try{
  const id=Number(q.run("INSERT INTO users(login_id,password_hash,role,qr_token_hash) VALUES('s-aa-01',?,'student',?)",hashPassword('demo1234'),sha256('demo-qr-token-at-least-20-chars')).lastInsertRowid);
  q.run("INSERT INTO settings(key,value) VALUES('demo_user_ids',?)",JSON.stringify([id]));
  config.demoMode=true;const c=client(base);
  assert.equal((await c.post('/api/auth/demo',{role:'student'})).status,200);
  assert.equal((await c.get('/api/auth/me')).data.user.id,id);
  config.demoMode=false;
  assert.equal((await c.get('/api/auth/me')).data.user,null);
  assert.equal((await c.post('/api/auth/demo',{role:'student'})).status,403);
  assert.equal((await c.login('s-aa-01','demo1234')).status,403);
  assert.equal((await c.post('/api/auth/qr',{token:'demo-qr-token-at-least-20-chars'})).status,403);
  q.run("INSERT INTO users(login_id,password_hash,role) VALUES('issued-teacher',?,'teacher')",hashPassword('issued-test-password'));
  assert.equal((await c.login('issued-teacher','issued-test-password')).status,200);
  assert.equal((await c.get('/api/auth/me')).data.user.role,'teacher');
 }finally{await new Promise(r=>server.close(r));}
});
