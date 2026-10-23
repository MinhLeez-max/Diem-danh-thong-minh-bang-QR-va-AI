import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getGetCurrentSchoolUserQueryKey, getListClassesQueryKey, getListSchoolUsersQueryKey, getListClassStudentsQueryKey, useListSchoolUsers, useUpdateSchoolUser, useListClasses, useListClassStudents } from '@workspace/api-client-react';
import type { SchoolUserUpdateInput } from '@workspace/api-client-react';
import { AlertCircle, ArrowLeft, Check, RefreshCw, ShieldCheck, Users } from 'lucide-react';

const roleText: Record<string, string> = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh', pending: 'Chờ phân quyền' };
const friendlyError = (error: unknown) => error instanceof Error ? error.message : 'Không thể cập nhật tài khoản. Vui lòng thử lại.';

export function AdminUsersPage() {
  const qc = useQueryClient();
  const users = useListSchoolUsers();
  const classes = useListClasses();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [role, setRole] = useState<SchoolUserUpdateInput['role']>('pending');
  const [classIds, setClassIds] = useState<number[]>([]);
  const [studentId, setStudentId] = useState('');
  const [studentClassId, setStudentClassId] = useState('');
  const [saved, setSaved] = useState(false);
  const update = useUpdateSchoolUser();
  const chosenUser = (users.data ?? []).find((user) => user.id === selectedId);
  const rosterClassId = Number(studentClassId || 0);
  const roster = useListClassStudents(rosterClassId, { query: { enabled: !!rosterClassId, queryKey: getListClassStudentsQueryKey(rosterClassId) } });
  const pendingCount = useMemo(() => (users.data ?? []).filter((user) => user.role === 'pending').length, [users.data]);
  const openUser = (id: number) => {
    const user = users.data?.find((entry) => entry.id === id);
    if (!user) return;
    setSelectedId(id); setRole(user.role); setClassIds(user.classIds ?? []);
    setStudentId(user.studentId ? String(user.studentId) : ''); setStudentClassId(''); setSaved(false); update.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSaved(false);
    update.mutate({ userId: selectedId, data: { role, studentId: role === 'student' ? (studentId ? Number(studentId) : null) : null, classIds: role === 'teacher' ? classIds : [] } }, {
      onSuccess: () => {
        setSaved(true);
        void qc.invalidateQueries({ queryKey: getListSchoolUsersQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetCurrentSchoolUserQueryKey() });
        void qc.invalidateQueries({ queryKey: getListClassesQueryKey() });
      },
    });
  };
  const toggleClass = (id: number) => setClassIds((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  return <main className="page-wrap">
    <div className="page-heading">
      <div><div className="eyebrow">Thiết lập trường học</div><h1>Tài khoản & phân quyền</h1><p className="page-subtitle">Xác nhận vai trò và kết nối tài khoản với lớp học trước khi sử dụng.</p></div>
      <button className="btn secondary" onClick={() => void users.refetch()} data-testid="button-refresh-users"><RefreshCw /> Làm mới</button>
    </div>
    <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
      <div className="card stat-card"><div className="stat-top"><span>Tổng tài khoản</span><span className="stat-icon"><Users /></span></div><div className="stat-value">{users.data?.length ?? '—'}</div><div className="stat-foot">Tài khoản trong không gian trường</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Đang chờ phân quyền</span><span className="stat-icon"><ShieldCheck /></span></div><div className="stat-value">{pendingCount}</div><div className="stat-foot">Chỉ quản trị viên mới có thể kích hoạt</div></div>
    </div>
    {users.isLoading ? <div className="loading-row">Đang tải danh sách tài khoản…</div> : users.isError ? <div className="empty-state card"><div className="empty-icon"><AlertCircle /></div><strong>Chưa thể tải tài khoản</strong><p>{friendlyError(users.error)}</p><button className="btn secondary" style={{ marginTop: 14 }} onClick={() => void users.refetch()}>Thử lại</button></div> : (
      <div className="two-col">
        <section className="card section-card">
          <div className="section-head"><div><h2>Danh sách tài khoản</h2><div className="section-kicker">Chọn một tài khoản để cập nhật quyền truy cập</div></div><span className="subject-chip">{users.data?.length ?? 0} TÀI KHOẢN</span></div>
          {!users.data?.length ? <div className="empty-state"><strong>Chưa có tài khoản nào</strong><p>Tài khoản trường sẽ xuất hiện sau khi đăng ký.</p></div> :
            <div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Vai trò</th><th></th></tr></thead><tbody>{users.data.map((user) => <tr key={user.id} data-testid={`row-school-user-${user.id}`}><td className="account-cell"><div className="student-name">{user.displayName || user.email}</div><div className="student-code">{user.email}</div></td><td><span className={`pill ${user.role === 'pending' ? 'review' : ''}`}>{roleText[user.role] ?? user.role}</span></td><td><button className={`btn ${selectedId === user.id ? '' : 'ghost'}`} onClick={() => openUser(user.id)} data-testid={`button-edit-user-${user.id}`}>{selectedId === user.id ? 'Đang chọn' : 'Phân quyền'}</button></td></tr>)}</tbody></table></div>
          }
        </section>
        <section className="card section-card">
          <div className="section-head"><div><h2>{chosenUser ? chosenUser.displayName || chosenUser.email : 'Chi tiết phân quyền'}</h2><div className="section-kicker">{chosenUser ? chosenUser.email : 'Chọn tài khoản ở danh sách bên cạnh'}</div></div>{chosenUser && <span className="subject-chip">#{chosenUser.id}</span>}</div>
          {!chosenUser ? <div className="empty-state"><div className="empty-icon"><ShieldCheck /></div><strong>Sẵn sàng cập nhật quyền</strong><p>Quản trị viên đầu tiên được khởi tạo tự động. Các tài khoản mới sẽ chờ duyệt tại đây.</p></div> :
            <form className="form-stack" onSubmit={submit} data-testid="form-assign-role">
              <label><span className="form-label">Vai trò trong trường</span><select className="select-field" value={role} onChange={(event) => setRole(event.target.value as SchoolUserUpdateInput['role'])} data-testid="select-user-role"><option value="pending">Chờ phân quyền</option><option value="admin">Quản trị viên</option><option value="teacher">Giáo viên</option><option value="student">Học sinh</option></select></label>
              {role === 'teacher' && <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="form-label">Lớp được phụ trách</legend>{classes.isLoading ? <div className="loading-row">Đang tải lớp…</div> : !classes.data?.length ? <div className="notice">Chưa có lớp học. Tạo lớp trước tại <Link className="text-link" href="/classes">Lớp học</Link>.</div> : <div className="class-assignment-list">{classes.data.map((classroom) => <label className="class-assignment" key={classroom.id}><input type="checkbox" checked={classIds.includes(classroom.id)} onChange={() => toggleClass(classroom.id)} /> <span><strong>{classroom.name}</strong><small>{classroom.subject} · {classroom.studentCount} học sinh</small></span></label>)}</div>}</fieldset>}
              {role === 'student' && <div className="form-stack" style={{ marginTop: 0 }}><label><span className="form-label">Lớp của học sinh</span><select className="select-field" value={rosterClassId || ''} onChange={(event) => { setStudentClassId(event.target.value); setStudentId(''); setSaved(false); update.reset(); }} data-testid="select-student-class"><option value="">Chọn lớp</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>)}</select></label><label><span className="form-label">Hồ sơ học sinh trong danh sách lớp</span><select className="select-field" value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={roster.isLoading} data-testid="select-linked-student"><option value="">Chưa liên kết</option>{studentId && !(roster.data ?? []).some(student => String(student.id) === studentId) && <option value={studentId}>{chosenUser.studentName} · {chosenUser.studentCode} (đã liên kết)</option>}{(roster.data ?? []).map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.studentCode}</option>)}</select><span className="form-help">{roster.isError ? 'Không thể tải danh sách lớp. Hãy thử làm mới.' : 'Liên kết giúp học sinh xác nhận bằng tài khoản thay vì nhập mã.'}</span></label></div>}
              {role === 'pending' && <div className="notice">Tài khoản chưa thể truy cập lớp học cho đến khi được phân vai trò.</div>}
              {update.isError && <div className="error-banner" role="alert">{friendlyError(update.error)}</div>}
              {saved && <div className="success-banner" role="status"><Check size={14} style={{ verticalAlign: 'middle' }} /> Đã lưu thay đổi cho tài khoản.</div>}
              <button className="btn" type="submit" disabled={update.isPending || (role === 'student' && !studentId)} data-testid="button-save-user-role">{update.isPending ? 'Đang lưu…' : 'Lưu phân quyền'}</button>
            </form>
          }
        </section>
      </div>
    )}
    <div style={{ marginTop: 18 }}><Link href="/" className="text-link"><ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Về tổng quan</Link></div>
  </main>;
}
