import { useState } from 'react';
import { api, dateTimeJa } from '../api.js';
import { useApi, Loading, ErrorBox, Field, Empty, useToast, downloadText } from '../ui.jsx';

const SAMPLE = `role,login_id,password,school_code,school_name,grade,class,attendance_no,student_key,company_code,company_name,company_industry,display_name,teacher_classes
teacher,t-sample,,SCH-A,サンプル高校,,,,,,,,担任A,1-A|1-B
student,s-sample-01,,SCH-A,サンプル高校,1,A,1,,,,,,
company,c-sample,,,,,,,,CO-9,サンプル株式会社,製造,担当者,`;

export default function Users() {
  const orgs = useApi('/admin/schools');
  const [filter, setFilter] = useState({ role: 'student', schoolId: '', classId: '' });
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const users = useApi(`/admin/users?${qs}`, [qs]);
  const [creds, setCreds] = useState(null);
  const toast = useToast();

  if (orgs.loading && !orgs.data) return <Loading />;
  if (orgs.error) return <ErrorBox error={orgs.error} onRetry={orgs.reload} />;

  const toggleActive = async (u) => {
    if (u.active && !window.confirm(`${u.login_id} を利用停止にします。ログイン中のセッションも無効になります。よろしいですか？`)) return;
    try { await api.patch(`/admin/users/${u.id}`, { active: !u.active }); users.reload(); toast(u.active ? '利用停止にしました' : '利用再開しました'); }
    catch (e) { toast(e.message, 'error'); }
  };

  const reissueClass = async (classId) => {
    if (!window.confirm('このクラスの生徒全員のQRとパスワードを再発行します。古いQRは使えなくなります。よろしいですか？')) return;
    try { const r = await api.post('/admin/users/reissue', { classId }); setCreds(r.credentials); toast(`${r.credentials.length}名分を再発行しました`); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>利用者管理</h1>

      {creds && <Credentials credentials={creds} onClose={() => setCreds(null)} />}

      <ImportPanel onDone={(r) => { setCreds(r.credentials); orgs.reload(); users.reload(); }} />

      <section className="panel">
        <h2>協力校とクラス</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>学校</th><th>コード</th><th>開始日</th><th className="num">生徒</th><th className="num">教員</th><th></th></tr></thead>
            <tbody>
              {orgs.data.schools.map((s) => <SchoolRow key={s.id} school={s} onSaved={orgs.reload} />)}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>開始日はK-S3（継続利用率）の起点に使います。学校ごとの実証開始日を入れてください。</p>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>クラス</th><th className="num">生徒</th><th></th></tr></thead>
            <tbody>
              {orgs.data.classes.map((c) => (
                <tr key={c.id}>
                  <td>{orgs.data.schools.find((s) => s.id === c.school_id)?.name} {c.grade}年{c.name}組</td>
                  <td className="num">{c.students}</td>
                  <td><button className="btn small" onClick={() => reissueClass(c.id)}>QR・パスワードを一括再発行</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>参加企業</h2>
        <CompanyEditor companies={orgs.data.companies} onSaved={orgs.reload} />
      </section>

      <section className="panel">
        <div className="spread">
          <h2 style={{ margin: 0 }}>アカウント一覧</h2>
          <div className="row">
            <select className="input" style={{ width: 'auto', minHeight: 36 }} value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value, classId: '' })}>
              <option value="student">生徒</option>
              <option value="teacher">教員</option>
              <option value="company">企業</option>
              <option value="admin">運営</option>
            </select>
            <select className="input" style={{ width: 'auto', minHeight: 36 }} value={filter.classId} onChange={(e) => setFilter({ ...filter, classId: e.target.value })}>
              <option value="">クラス指定なし</option>
              {orgs.data.classes.map((c) => <option key={c.id} value={c.id}>{orgs.data.schools.find((s) => s.id === c.school_id)?.name} {c.grade}-{c.name}</option>)}
            </select>
          </div>
        </div>
        {users.loading && <Loading />}
        <ErrorBox error={users.error} onRetry={users.reload} />
        {users.data && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>ログインID</th><th>所属</th><th>番号／氏名</th><th>仮名ID</th><th>最終ログイン</th><th>状態</th><th></th></tr></thead>
              <tbody>
                {users.data.users.map((u) => (
                  <tr key={u.id}>
                    <td><code>{u.login_id}</code></td>
                    <td className="small">{u.school_name || u.company_name || '—'}{u.grade ? ` ${u.grade}年${u.class_name}組` : ''}</td>
                    <td>{u.role === 'student' ? `${u.attendance_no}番` : (u.display_name || '—')}</td>
                    <td className="small muted">{u.pseudo_id || '—'}</td>
                    <td className="small muted">{u.last_login_at ? dateTimeJa(u.last_login_at) : '未ログイン'}</td>
                    <td>{u.active ? <span className="badge ok">有効</span> : <span className="badge">停止</span>}</td>
                    <td className="row" style={{ gap: 6 }}>
                      <button className="btn small ghost" onClick={async () => {
                        try { const r = await api.post('/admin/users/reissue', { userIds: [u.id] }); setCreds(r.credentials); }
                        catch (e) { toast(e.message, 'error'); }
                      }}>再発行</button>
                      <button className="btn small ghost" onClick={() => toggleActive(u)}>{u.active ? '停止' : '再開'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.data?.users.length === 0 && <Empty>該当するアカウントはありません。</Empty>}
      </section>
    </div>
  );
}

function SchoolRow({ school, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(school.name);
  const [startDate, setStart] = useState(school.start_date || '');
  const toast = useToast();
  const save = async () => {
    try { await api.put(`/admin/schools/${school.id}`, { name, startDate }); setEdit(false); onSaved(); toast('保存しました'); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <tr>
      <td>{edit ? <input className="input" value={name} onChange={(e) => setName(e.target.value)} /> : school.name}</td>
      <td><code>{school.code}</code></td>
      <td>{edit ? <input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /> : (school.start_date || <span className="muted">未設定</span>)}</td>
      <td className="num">{school.students}</td>
      <td className="num">{school.teachers}</td>
      <td>{edit ? <div className="row" style={{ gap: 6 }}><button className="btn small primary" onClick={save}>保存</button><button className="btn small ghost" onClick={() => setEdit(false)}>取消</button></div> : <button className="btn small ghost" onClick={() => setEdit(true)}>編集</button>}</td>
    </tr>
  );
}

function CompanyEditor({ companies, onSaved }) {
  const [form, setForm] = useState({ code: '', name: '', industry: '' });
  const toast = useToast();
  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/admin/companies', form); setForm({ code: '', name: '', industry: '' }); onSaved(); toast('企業を登録しました'); }
    catch (x) { toast(x.message, 'error'); }
  };
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr><th>企業</th><th>コード</th><th>業種</th><th className="num">担当者</th><th className="num">公開テーマ</th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td><code>{c.code}</code></td><td>{c.industry || '—'}</td><td className="num">{c.users}</td><td className="num">{c.published}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="row" onSubmit={add} style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <Field label="企業コード"><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="CO-06" /></Field>
        <Field label="企業名"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="業種"><input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></Field>
        <button className="btn">企業を追加</button>
      </form>
      <p className="muted small">企業の担当者アカウントは、下のCSV取込（role=company）で作成します。</p>
    </>
  );
}

function ImportPanel({ onDone }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);
  const toast = useToast();

  const run = async () => {
    setBusy(true); setErrors(null);
    try {
      const r = await api.post('/admin/users/import', { csv });
      toast(`新規 ${r.created}件・更新 ${r.updated}件を登録しました`);
      setCsv('');
      onDone(r);
    } catch (e) {
      if (e.data?.errors) setErrors(e.data.errors);
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  };

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>利用者の一括登録（CSV）</h2>
      <p className="muted small" style={{ margin: 0 }}>
        1行でもエラーがあると<b>何も登録されません</b>（中途半端な登録を防ぐため）。
        生徒の氏名は登録できません（<code>display_name</code> は空欄）。同じ <code>login_id</code> は上書き更新されます。
        進級で学年・組が変わっても仮名IDを保つには <code>student_key</code>（学校側の生徒固有キー）を入れてください。
      </p>
      <div className="row">
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <button className="btn small ghost" onClick={() => downloadText('利用者登録_見本.csv', '\uFEFF' + SAMPLE)}>見本CSVをダウンロード</button>
      </div>
      <textarea className="input" style={{ fontFamily: 'ui-monospace, monospace', minHeight: 140 }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE} />
      {errors && (
        <div className="notice alert">
          <b>取り込めませんでした（{errors.length}件のエラー）</b>
          <ul style={{ margin: '6px 0 0' }}>{errors.slice(0, 30).map((x, i) => <li key={i}>{x.line}行目：{x.error}</li>)}</ul>
        </div>
      )}
      <button className="btn primary" disabled={busy || !csv.trim()} onClick={run}>{busy ? '取り込み中…' : '取り込む'}</button>
    </section>
  );
}

function Credentials({ credentials, onClose }) {
  return (
    <section className="panel stack" style={{ borderColor: 'var(--pen)' }}>
      <div className="spread no-print">
        <div>
          <h2 style={{ margin: 0 }}>ログイン情報（{credentials.length}件）</h2>
          <p className="small" style={{ margin: 0, color: 'var(--alert)' }}>パスワードは<b>この画面を閉じると二度と表示されません</b>。印刷またはCSV保存してから閉じてください。</p>
        </div>
        <div className="row">
          <button className="btn small" onClick={() => window.print()}>印刷する</button>
          <button className="btn small ghost" onClick={() => downloadText('ログイン情報.csv', '\uFEFF' + 'role,login_id,password,grade,class,attendance_no,display_name\n' + credentials.map((c) => [c.role, c.loginId, c.password, c.grade || '', c.class || '', c.attendanceNo || '', c.displayName || ''].join(',')).join('\n'))}>CSV保存</button>
          <button className="btn small danger" onClick={onClose}>閉じる</button>
        </div>
      </div>
      <div className="qr-sheet">
        {credentials.map((c) => (
          <div className="qr-card" key={c.userId}>
            {c.qrSvg ? <div dangerouslySetInnerHTML={{ __html: c.qrSvg }} /> : <div className="small muted" style={{ width: 96, textAlign: 'center' }}>QRなし</div>}
            <div>
              <div className="who">{c.role === 'student' ? `${c.grade}年${c.class}組 ${c.attendanceNo}番` : (c.displayName || c.loginId)}</div>
              <div className="small">ID <code>{c.loginId}</code></div>
              <div className="small">パスワード <code>{c.password}</code></div>
              {c.qrSvg && <div className="small muted">QRを読み取るとすぐ使えます</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
