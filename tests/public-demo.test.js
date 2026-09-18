import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialState, validDemoState, loadDemo, saveDemo, STORAGE_KEY } from '../client/src/public-demo/model.js';

function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test('公開デモは架空素材だけから初期化し、教員コピーと授業の内容は独立する', () => {
  const state = makeInitialState();
  assert.equal(validDemoState(state), true);
  const company = state.curricula.find(c => c.id === 'company-robot');
  const teacher = state.curricula.find(c => c.kind === 'teacher');
  assert.equal(company.stages.reduce((sum, s) => sum + s.minutes, 0), company.duration);
  const before = state.lessons[0].stages[0].activity;
  company.stages[0].activity = '企業による変更';
  assert.notEqual(teacher.stages[0].activity, '企業による変更');
  teacher.stages[0].activity = '教員による変更';
  assert.equal(state.lessons[0].stages[0].activity, before);
  assert.equal(JSON.stringify(state).includes('password'), false);
});

test('公開デモは専用保存キーを使い、同じブラウザーの変更を再読込できる', () => {
  const storage = memoryStorage();
  storage.setItem('another-application', 'untouched');
  const state = makeInitialState();
  state.notes.push({ id: 'new-note', body: '架空の問いかけ', date: '2026-09-18' });
  saveDemo(storage, state);
  assert.deepEqual(loadDemo(storage).state, state);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(storage.getItem('another-application'), 'untouched');
});

test('破損した保存内容や不正な授業段階では、安全な初期表示へ戻る', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{broken');
  assert.ok(loadDemo(storage).warning);
  const state = makeInitialState();
  state.lessons[0].stageIndex = 100;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
  const restored = loadDemo(storage);
  assert.ok(restored.warning);
  assert.equal(restored.state.lessons[0].stageIndex, 0);
  assert.throws(() => saveDemo(storage, state));
});

test('端末保存が使えなくても架空データを表示し、保存失敗を握りつぶさない', () => {
  assert.equal(validDemoState(loadDemo(undefined).state), true);
  assert.ok(loadDemo(undefined).warning);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.ok(loadDemo(blocked).warning);
  assert.throws(() => saveDemo(blocked, makeInitialState()), /quota/);
});

test('表示する入れ子データの型と出典URLを検証し、壊れた保存内容を採用しない', () => {
  const cases = [
    state => { state.curricula[0].alignment.sourceReferences = [null]; },
    state => { state.curricula[0].alignment.processes = [null]; },
    state => { state.curricula[0].alignment.pillars[0].objective = {}; },
    state => { state.lessons[0].objectives = [{}]; },
    state => { state.lessons[1].response.interests = [{}]; },
    state => { state.journeys[0].topic = {}; },
    state => { state.curricula[0].alignment.sourceReferences[0].url = 'javascript:alert(1)'; },
  ];
  for (const corrupt of cases) {
    const state = makeInitialState(); corrupt(state);
    assert.equal(validDemoState(state), false);
    const storage = memoryStorage(); storage.setItem(STORAGE_KEY, JSON.stringify(state));
    assert.ok(loadDemo(storage).warning);
    assert.equal(validDemoState(loadDemo(storage).state), true);
  }
});
