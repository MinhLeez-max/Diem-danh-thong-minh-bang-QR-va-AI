import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  useGetAttendanceOverview,
  getGetAttendanceOverviewQueryKey,
  useListClasses,
  getListClassesQueryKey,
  useCreateClass,
  useListClassStudents,
  getListClassStudentsQueryKey,
  useListAttendanceSessions,
  getListAttendanceSessionsQueryKey,
  useCreateAttendanceSession,
  useGetAttendanceSession,
  getGetAttendanceSessionQueryKey,
  useCloseAttendanceSession,
  useListSessionCheckIns,
  getListSessionCheckInsQueryKey,
  useCreateSessionCheckIn,
  useUpdateAttendanceRecord,
  useCreateCountSnapshot,
  useGetSessionReconciliation,
  getGetSessionReconciliationQueryKey,
  useGetAttendanceReport,
  getGetAttendanceReportQueryKey,
} from '@workspace/api-client-react';
import type { AttendanceRecord, Classroom } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowUpRight, BookOpen, CalendarClock, Camera, Check, CheckCheck, ChevronRight,
  CircleAlert, Clock3, Download, ExternalLink, FileBarChart2, GraduationCap,
  LoaderCircle, Plus, QrCode, RefreshCw, Search, ShieldCheck, Users,
  VideoOff, X,
} from 'lucide-react';

const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value))
  : 'Chưa ghi nhận';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.';

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingState({ label = 'Đang đồng bộ dữ liệu lớp học…' }: { label?: string }) {
  return <div className="loading-row" role="status" data-testid="status-loading">{label}</div>;
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="empty-state card" data-testid="status-error">
      <div className="empty-icon"><CircleAlert /></div>
      <strong>Chưa thể tải dữ liệu</strong>
      <p>{errorText(error)}</p>
      <button className="btn secondary" style={{ marginTop: 15 }} onClick={retry} data-testid="button-retry">
        <RefreshCw /> Thử lại
      </button>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" data-testid="status-empty">
      <div className="empty-icon"><BookOpen /></div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === 'active';
  return <span className={`pill ${active ? '' : 'closed'}`} data-testid={`status-session-${status}`}>{active ? 'Đang mở' : 'Đã kết thúc'}</span>;
}

export function DashboardPage() {
  const overview = useGetAttendanceOverview();
  const sessionsQuery = useListAttendanceSessions();
  const refresh = () => {
    void overview.refetch();
    void sessionsQuery.refetch();
  };
  const data = overview.data;
  const active = data?.activeSession;
  const sessions = data?.recentSessions ?? sessionsQuery.data ?? [];
  return (
    <main className="page-wrap">
      <PageHeading
        eyebrow="Không gian hôm nay"
        title="Lớp học, trong tầm mắt."
        subtitle="Một bảng điểm danh rõ ràng để bạn bắt đầu tiết học thật nhẹ nhàng."
        action={<Link href="/classes" className="btn" data-testid="button-start-session"><Plus /> Bắt đầu điểm danh</Link>}
      />
      {overview.isLoading ? <LoadingState /> : overview.isError ? <ErrorState error={overview.error} retry={refresh} /> : (
        <>
          <section className="stat-grid" aria-label="Tổng quan" data-testid="dashboard-overview">
            <div className="card stat-card">
              <div className="stat-top"><span>Lớp đang phụ trách</span><span className="stat-icon"><BookOpen /></span></div>
              <div className="stat-value" data-testid="text-class-count">{data?.classCount ?? 0}</div>
              <div className="stat-foot">Các lớp học đã được kết nối</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Học sinh</span><span className="stat-icon"><Users /></span></div>
              <div className="stat-value" data-testid="text-student-count">{data?.studentCount ?? 0}</div>
              <div className="stat-foot">Trong danh sách lớp hiện tại</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Buổi học hôm nay</span><span className="stat-icon"><CalendarClock /></span></div>
              <div className="stat-value" data-testid="text-sessions-today">{data?.sessionsToday ?? 0}</div>
              <div className="stat-foot">Lịch sử được cập nhật tức thời</div>
            </div>
            <div className="card stat-card">
              <div className="stat-top"><span>Tỷ lệ có mặt</span><span className="stat-icon"><CheckCheck /></span></div>
              <div className="stat-value" data-testid="text-attendance-rate">{(data?.averageAttendanceRate ?? 0).toFixed(1)}%</div>
              <div className="stat-foot">Trung bình các buổi ghi nhận</div>
            </div>
          </section>
          <section className="dashboard-grid">
            <div className="card section-card">
              <div className="section-head">
                <div><h2>Buổi học gần đây</h2><div className="section-kicker">Nhịp lớp trong những buổi mới nhất</div></div>
                <Link href="/reports" className="text-link" data-testid="link-all-reports">Xem báo cáo <ChevronRight size={14} style={{ verticalAlign: 'middle' }} /></Link>
              </div>
              {sessionsQuery.isLoading && !data ? <LoadingState label="Đang tải các buổi học…" /> : sessions.length === 0 ? <EmptyState title="Chưa có buổi điểm danh" detail="Mở lớp học để tạo buổi điểm danh đầu tiên." /> : (
                <div className="session-list">
                  {sessions.slice(0, 5).map((session) => (
                    <Link href={`/sessions/${session.id}`} className="session-row" key={session.id} data-testid={`row-recent-session-${session.id}`}>
                      <div className="session-symbol"><GraduationCap /></div>
                      <div><div className="session-title">{session.className} <StatusPill status={session.status} /></div><div className="session-detail">{session.subject} · {dateTime(session.startedAt)}</div></div>
                      <div className="session-count">{session.checkedInCount}<small>/ {session.studentCount} đã điểm danh</small></div>
                    </Link>
                  ))}
                </div>
              )}
              {sessionsQuery.isError && !data && <ErrorState error={sessionsQuery.error} retry={refresh} />}
            </div>
            <div className="card active-panel">
              <div className="section-head">
                <div><h2>Đang diễn ra</h2><div className="section-kicker">Theo dõi buổi học hiện tại</div></div>
                {active && <span className="live-dot" aria-label="Buổi học đang hoạt động" />}
              </div>
              {active ? (
                <>
                  <div style={{ font: '700 18px var(--app-font-display)' }} data-testid="text-active-class">{active.className}</div>
                  <div className="active-subject">{active.subject} · Bắt đầu lúc {dateTime(active.startedAt)}</div>
                  <div className="attendance-big">{active.checkedInCount}<span> / {active.studentCount}</span></div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${active.studentCount ? Math.min(100, active.checkedInCount / active.studentCount * 100) : 0}%` }} /></div>
                  <div className="active-meta"><span>Đã xác nhận</span><span>{active.studentCount ? Math.round(active.checkedInCount / active.studentCount * 100) : 0}%</span></div>
                  <div className="actions-stack">
                    <Link href={`/sessions/${active.id}`} className="btn" data-testid="button-open-active-session">Mở buổi điểm danh <ChevronRight /></Link>
                    <Link href="/check-in" className="btn secondary" data-testid="button-student-checkin">Biểu mẫu học sinh <ExternalLink /></Link>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '18px 4px' }} data-testid="status-no-active-session">
                  <div className="empty-icon"><Clock3 /></div><strong>Chưa mở buổi học nào</strong><p>Chọn một lớp để tạo mã QR điểm danh.</p>
                  <Link className="btn" href="/classes" style={{ marginTop: 15 }} data-testid="link-open-classes">Chọn lớp <ChevronRight /></Link>
                </div>
              )}
            </div>
            <div className="card section-card">
              <div className="section-head"><div><h2>Nhật ký hoạt động</h2><div className="section-kicker">Các cập nhật mới nhất</div></div><span className="subject-chip">MỚI NHẤT</span></div>
              {!data?.activities?.length ? <EmptyState title="Chưa có hoạt động" detail="Cập nhật sẽ xuất hiện tại đây." /> : (
                <div className="activity-list">
                  {data.activities.slice(0, 6).map((activity) => (
                    <div className="activity-item" key={activity.id} data-testid={`activity-entry-${activity.id}`}>
                      <div className="activity-marker"><Check /></div>
                      <div><div className="activity-copy">{activity.message}</div><div className="activity-time">{dateTime(activity.createdAt)}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card section-card" style={{ background: '#f5eddb' }}>
              <div className="section-head"><div><h2>Hai nguồn, một bức tranh</h2><div className="section-kicker">Đối chiếu minh bạch, không thay thế giáo viên</div></div><ShieldCheck color="#927338" size={19} /></div>
              <p style={{ color: '#6f6246', fontSize: 11, lineHeight: 1.7, marginBottom: 0 }}>QR xác nhận từng học sinh bằng mã cá nhân. Camera, nếu được kết nối, chỉ gửi một con số tổng hợp để tham khảo — không nhận diện khuôn mặt, không lưu hình ảnh.</p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export function ClassesPage() {
  const qc = useQueryClient();
  const classes = useListClasses();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', room: '' });
  const [formError, setFormError] = useState('');
  const students = useListClassStudents(selectedId ?? 0, { query: { enabled: selectedId !== null, queryKey: getListClassStudentsQueryKey(selectedId ?? 0) } });
  const createClass = useCreateClass();
  const createSession = useCreateAttendanceSession();
  const [, setLocation] = useLocation();
  const items = classes.data ?? [];
  const filtered = items.filter((c) => `${c.name} ${c.subject} ${c.room}`.toLowerCase().includes(search.toLowerCase()));
  const refresh = () => void classes.refetch();
  const submitClass = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    createClass.mutate({ data: form }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListClassesQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setForm({ name: '', subject: '', room: '' });
        setModal(false);
      },
      onError: (error) => setFormError(errorText(error)),
    });
  };
  const startSession = (classroom: Classroom) => {
    createSession.mutate({ data: { classId: classroom.id } }, {
      onSuccess: (session) => {
        void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        setLocation(`/sessions/${session.id}`);
      },
    });
  };
  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Danh mục giảng dạy" title="Lớp học của bạn" subtitle="Chọn lớp để xem sĩ số hoặc mở một buổi điểm danh mới." action={<button className="btn" onClick={() => setModal(true)} data-testid="button-create-class"><Plus /> Thêm lớp học</button>} />
      <div className="two-col">
        <section>
          <div className="filter-bar">
            <div className="toolbar">
              <label className="search-field"><Search /><input className="field" placeholder="Tìm lớp, môn học…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-classes" /></label>
              <span className="page-subtitle">{filtered.length} lớp</span>
            </div>
            <button className="icon-button" onClick={refresh} aria-label="Làm mới danh sách lớp" data-testid="button-refresh-classes"><RefreshCw /></button>
          </div>
          {classes.isLoading ? <LoadingState label="Đang tải danh sách lớp…" /> : classes.isError ? <ErrorState error={classes.error} retry={refresh} /> : filtered.length === 0 ? <div className="card"><EmptyState title={search ? 'Không tìm thấy lớp phù hợp' : 'Chưa có lớp học'} detail={search ? 'Thử một từ khóa khác.' : 'Thêm lớp để bắt đầu quản lý điểm danh.'} /></div> : (
            <div className="class-grid">
              {filtered.map((classroom) => (
                <button className={`card class-card ${selectedId === classroom.id ? 'selected' : ''}`} key={classroom.id} onClick={() => setSelectedId(classroom.id)} data-testid={`card-class-${classroom.id}`}>
                  <div className="class-card-top"><span className="subject-chip">{classroom.subject}</span><ChevronRight size={15} color="#70867c" /></div>
                  <div className="class-name">{classroom.name}</div>
                  <div className="class-meta"><span>Phòng {classroom.room}</span><span>{classroom.studentCount} học sinh</span></div>
                  <div className="class-footer"><span>Mở danh sách lớp</span><span>#{String(classroom.id).padStart(3, '0')}</span></div>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="card section-card">
          <div className="section-head">
            <div><h2>{items.find((c) => c.id === selectedId)?.name ?? 'Danh sách học sinh'}</h2><div className="section-kicker">{selectedId ? 'Học sinh trong lớp đã chọn' : 'Chọn một lớp để xem danh sách'}</div></div>
            {selectedId && <button className="btn" onClick={() => startSession(items.find((c) => c.id === selectedId)!)} disabled={createSession.isPending} data-testid="button-start-class-session">{createSession.isPending ? <LoaderCircle /> : <QrCode />} Bắt đầu</button>}
          </div>
          {createSession.isError && <div className="error-banner" role="alert">{errorText(createSession.error)}</div>}
          {!selectedId ? <EmptyState title="Chọn lớp học" detail="Danh sách học sinh sẽ hiện ở đây." /> : students.isLoading ? <LoadingState label="Đang tải danh sách học sinh…" /> : students.isError ? <ErrorState error={students.error} retry={() => void students.refetch()} /> : !students.data?.length ? <EmptyState title="Chưa có học sinh" detail="Lớp này chưa có dữ liệu học sinh." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Học sinh</th><th>Chuyên cần</th></tr></thead>
                <tbody>{students.data.map((student) => <tr key={student.id} data-testid={`row-student-${student.id}`}><td><div className="student-name">{student.fullName}</div><div className="student-code">{student.studentCode}</div></td><td><div className="rate">{student.attendanceRate.toFixed(1)}%</div><div className="meter"><span style={{ width: `${Math.min(100, student.attendanceRate)}%` }} /></div></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {modal && (
        <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(22,43,39,.48)', display: 'grid', placeItems: 'center', padding: 18 }}>
          <form className="card checkin-card" onSubmit={submitClass} style={{ width: 'min(100%, 450px)' }} data-testid="form-create-class">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}><div><div className="eyebrow">Danh mục lớp</div><h2 style={{ font: '800 22px var(--app-font-display)', letterSpacing: '-.04em', margin: 0 }}>Thêm lớp học</h2></div><button type="button" className="icon-button" onClick={() => setModal(false)} aria-label="Đóng biểu mẫu" data-testid="button-close-class-dialog"><X /></button></div>
            <div className="form-stack">
              <label><span className="form-label">Tên lớp</span><input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: 10A1" data-testid="input-class-name" /></label>
              <label><span className="form-label">Môn học</span><input className="field" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Ví dụ: Toán học" data-testid="input-class-subject" /></label>
              <label><span className="form-label">Phòng học</span><input className="field" required value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Ví dụ: A203" data-testid="input-class-room" /></label>
              {formError && <div className="error-banner" role="alert">{formError}</div>}
              <button className="btn" type="submit" disabled={createClass.isPending} data-testid="button-submit-class">{createClass.isPending ? <LoaderCircle /> : <Plus />} Tạo lớp học</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export function SessionPage() {
  const [, params] = useRoute('/sessions/:sessionId');
  const id = Number(params?.sessionId ?? 0);
  const qc = useQueryClient();
  const session = useGetAttendanceSession(id, { query: { enabled: !!id, queryKey: getGetAttendanceSessionQueryKey(id), refetchInterval: 12000 } });
  const records = useListSessionCheckIns(id, { query: { enabled: !!id, queryKey: getListSessionCheckInsQueryKey(id), refetchInterval: 12000 } });
  const reconciliation = useGetSessionReconciliation(id, { query: { enabled: !!id, queryKey: getGetSessionReconciliationQueryKey(id), refetchInterval: 12000 } });
  const closeSession = useCloseAttendanceSession();
  const updateRecord = useUpdateAttendanceRecord();
  const createCount = useCreateCountSnapshot();
  const [qrImage, setQrImage] = useState('');
  const [count, setCount] = useState('');
  const [confidence, setConfidence] = useState('0.8');
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'counting' | 'error'>('idle');
  const [cameraMessage, setCameraMessage] = useState('');
  const [cameraCount, setCameraCount] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const item = session.data;
  useEffect(() => {
    if (!item?.qrToken || item.status !== 'active') { setQrImage(''); return; }
    const link = `${window.location.origin}/check-in?token=${encodeURIComponent(item.qrToken)}`;
    let cancelled = false;
    QRCode.toDataURL(link, { width: 360, margin: 1, color: { dark: '#173f3a', light: '#ffffff' }, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => { if (!cancelled) setQrImage(''); });
    return () => { cancelled = true; };
  }, [item?.qrToken, item?.status]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  const refresh = () => {
    void session.refetch();
    void records.refetch();
    void reconciliation.refetch();
  };
  const invalidateSessionData = () => {
    void qc.invalidateQueries({ queryKey: getGetAttendanceSessionQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getListSessionCheckInsQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
    void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
    void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
  };
  const saveCount = (event: FormEvent) => {
    event.preventDefault();
    if (!count || Number(count) < 0) return;
    createCount.mutate({ sessionId: id, data: { estimatedCount: Number(count), confidence: Number(confidence), source: 'demo' } }, {
      onSuccess: () => {
        setCount('');
        void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
      },
    });
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
    setCameraMessage('');
    setCameraCount(null);
  };
  useEffect(() => {
    if (item?.status !== 'active') {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraState('idle');
    }
  }, [item?.status]);
  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraMessage('Trình duyệt này không hỗ trợ truy cập camera. Hãy dùng camera thử nghiệm trên trình duyệt hiện đại.');
      return;
    }
    setCameraState('starting');
    setCameraMessage('Đang mở camera và tải mô hình đếm người về thiết bị…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (!modelRef.current) {
        modelRef.current = await cocoSsd.load({ base: 'mobilenet_v2' });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('ready');
      setCameraMessage('Camera đã sẵn sàng. Khung hình được phân tích ngay trên thiết bị.');
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraState('error');
      setCameraMessage(error instanceof Error ? error.message : 'Không thể mở camera hoặc tải mô hình đếm người.');
    }
  };
  const analyzeCamera = async () => {
    const model = modelRef.current;
    const video = videoRef.current;
    if (!model || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCameraMessage('Camera chưa có khung hình để phân tích.');
      return;
    }
    setCameraState('counting');
    setCameraMessage('Đang ước lượng số người trong khung hình…');
    try {
      const detections = await model.detect(video);
      const people = detections.filter((detection) => detection.class === 'person' && detection.score >= 0.4);
      const estimate = people.length;
      const score = people.length
        ? people.reduce((total, detection) => total + detection.score, 0) / people.length
        : 0.5;
      const normalizedConfidence = Math.round(score * 100) / 100;
      setCameraCount(estimate);
      setCount(String(estimate));
      setConfidence(String(normalizedConfidence));
      createCount.mutate(
        { sessionId: id, data: { estimatedCount: estimate, confidence: normalizedConfidence, source: 'camera' } },
        {
          onSuccess: () => {
            setCameraMessage('Đã lưu số đếm ước lượng. Giáo viên cần xác nhận mọi chênh lệch.');
            void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(id) });
          },
          onError: (error) => setCameraMessage(`Không lưu được số đếm: ${errorText(error)}`),
        },
      );
    } catch (error) {
      setCameraMessage(error instanceof Error ? error.message : 'Không thể phân tích khung hình.');
    } finally {
      setCameraState('ready');
    }
  };
  const handleClose = () => {
    if (!window.confirm('Kết thúc buổi điểm danh này?')) return;
    closeSession.mutate({ sessionId: id }, { onSuccess: invalidateSessionData });
  };
  if (!id) return <main className="page-wrap"><ErrorState error={new Error('Mã buổi học không hợp lệ.')} retry={() => {}} /></main>;
  return (
    <main className="page-wrap">
      {session.isLoading ? <LoadingState label="Đang tải buổi điểm danh…" /> : session.isError ? <ErrorState error={session.error} retry={refresh} /> : item ? (
        <>
          <PageHeading eyebrow={`Buổi học #${item.id} · ${dateTime(item.startedAt)}`} title={item.className} subtitle={`${item.subject} · Mã QR dành riêng cho học sinh của lớp`} action={item.status === 'active' ? <button className="btn danger" onClick={handleClose} disabled={closeSession.isPending} data-testid="button-close-session">{closeSession.isPending ? <LoaderCircle /> : <X />} Kết thúc buổi</button> : <StatusPill status={item.status} />} />
          {closeSession.isError && <div className="error-banner">{errorText(closeSession.error)}</div>}
          <div className="session-layout">
            <section>
              <div className="card section-card" style={{ marginBottom: 15 }}>
                <div className="section-head"><div><h2>Danh sách điểm danh</h2><div className="section-kicker">{item.checkedInCount} đã xác nhận trên {item.studentCount} học sinh</div></div><button className="icon-button" onClick={refresh} aria-label="Làm mới dữ liệu điểm danh" data-testid="button-refresh-session"><RefreshCw /></button></div>
                {records.isLoading ? <LoadingState label="Đang cập nhật điểm danh…" /> : records.isError ? <ErrorState error={records.error} retry={() => void records.refetch()} /> : !records.data?.length ? <EmptyState title="Chưa có lượt điểm danh" detail="Khi học sinh gửi biểu mẫu, kết quả sẽ xuất hiện tại đây." /> : (
                  <div className="table-wrap"><table><thead><tr><th>Học sinh</th><th>Thời gian</th><th>Trạng thái</th><th>Điều chỉnh</th></tr></thead><tbody>
                    {records.data.map((record) => <CheckInRow key={record.id} record={record} pending={updateRecord.isPending} onUpdate={(status) => updateRecord.mutate({ recordId: record.id, data: { status } }, { onSuccess: invalidateSessionData })} />)}
                  </tbody></table></div>
                )}
                {updateRecord.isError && <div className="error-banner" role="alert">{errorText(updateRecord.error)}</div>}
              </div>
              <div className="card section-card">
                <div className="section-head"><div><h2>Đối chiếu sĩ số</h2><div className="section-kicker">Tham khảo số lượng tổng hợp bên cạnh QR xác nhận cá nhân</div></div><span className={`pill ${reconciliation.data?.needsReview ? 'review' : ''}`}>{reconciliation.data?.needsReview ? 'Cần xem lại' : 'Tham khảo'}</span></div>
                {reconciliation.isLoading ? <LoadingState label="Đang tải số liệu đối chiếu…" /> : reconciliation.isError ? <ErrorState error={reconciliation.error} retry={() => void reconciliation.refetch()} /> : (
                  <>
                    <div className="compare-numbers">
                      <div className="compare-number"><span>QR đã xác nhận</span><strong data-testid="text-qr-count">{reconciliation.data?.checkedInCount ?? item.checkedInCount}</strong></div>
                      <div className="compare-number"><span>Số lượng tổng hợp</span><strong data-testid="text-estimated-count">{reconciliation.data?.estimatedCount ?? '—'}</strong></div>
                    </div>
                    <div className="notice" data-testid="text-reconciliation-message">{reconciliation.data?.message ?? 'Chưa có lượt đếm tổng hợp. Camera chưa kết nối.'}{reconciliation.data?.difference !== null && reconciliation.data?.difference !== undefined ? ` Chênh lệch: ${reconciliation.data.difference}.` : ''}</div>
                  </>
                )}
              </div>
            </section>
            <aside>
              <div className="card qr-card">
                <div className="eyebrow">Điểm danh bằng QR</div><h2>Quét để mở biểu mẫu</h2><p className="section-kicker">Học sinh nhập mã định danh của mình.</p>
                {item.status === 'active' ? (
                  <>
                    <div className="qr-frame" data-testid="qr-code-display">{qrImage ? <img src={qrImage} alt={`Mã QR điểm danh ${item.className}`} data-testid="img-session-qr" /> : <div className="loading-row">Đang tạo mã QR…</div>}</div>
                    <div className="token-line" data-testid="text-qr-token">{item.qrToken}</div>
                    <a href={`/check-in?token=${encodeURIComponent(item.qrToken)}`} className="text-link" data-testid="link-checkin-token">Mở liên kết điểm danh <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a>
                    <p className="qr-note" style={{ marginTop: 13 }}>Mã hết hạn lúc {dateTime(item.qrExpiresAt)}. Chỉ xác nhận sau khi máy chủ phản hồi thành công.</p>
                  </>
                ) : <div className="notice" data-testid="status-session-qr-closed">Buổi điểm danh đã kết thúc. Mã QR không còn hiệu lực.</div>}
              </div>
               <div className="card section-card" style={{ marginTop: 14 }}>
                <div className="section-head"><div><h2>Đếm sĩ số tổng hợp</h2><div className="section-kicker">AI chạy trên thiết bị · chỉ đếm người</div></div><Camera size={17} color="#71877a" /></div>
                <video ref={videoRef} className={`camera-video ${cameraState === 'ready' || cameraState === 'counting' ? 'visible' : ''}`} autoPlay playsInline muted aria-label="Xem trước camera; chỉ đếm người, không nhận diện danh tính" data-testid="video-camera-preview" />
                {item.status !== 'active' ? <div className="notice">Đã kết thúc buổi học. Camera không chạy cho phiên này.</div> : (
                  <>
                {cameraState === 'idle' || cameraState === 'error' ? <div className="camera-box" data-testid="camera-disconnected-state"><div><VideoOff /><strong>{cameraState === 'error' ? 'Không mở được camera' : 'Camera chưa kết nối'}</strong><span>{cameraMessage || 'Kết nối camera có sẵn trên thiết bị này để thử đếm người trực tiếp.'}</span></div></div> : null}
                {cameraMessage && cameraState !== 'idle' && cameraState !== 'error' && <div className="camera-message" role="status" data-testid="status-camera">{cameraMessage}</div>}
                {cameraCount !== null && <div className="camera-result" data-testid="text-camera-count">Lần đếm gần nhất: <strong>{cameraCount} người</strong></div>}
                <div className="camera-actions">
                  {cameraState === 'idle' || cameraState === 'error' || cameraState === 'starting'
                    ? <button type="button" className="btn secondary" onClick={() => void startCamera()} disabled={cameraState === 'starting'} data-testid="button-connect-camera">{cameraState === 'starting' ? <LoaderCircle /> : <VideoOff />}{cameraState === 'starting' ? 'Đang kết nối…' : 'Kết nối camera'}</button>
                    : <><button type="button" className="btn" onClick={() => void analyzeCamera()} disabled={cameraState !== 'ready' || createCount.isPending} data-testid="button-analyze-camera">{cameraState === 'counting' || createCount.isPending ? <LoaderCircle /> : <Users />} Phân tích một khung hình</button><button type="button" className="btn ghost" onClick={stopCamera} data-testid="button-stop-camera">Ngắt camera</button></>}
                </div>
                <div className="camera-footnote">Camera chỉ cung cấp ước lượng số lượng; mô hình không nhận diện danh tính. Độ che khuất và góc máy có thể làm sai số.</div>
                <details className="manual-count-details">
                  <summary>Nhập số đếm thử nghiệm thủ công</summary>
                <form onSubmit={saveCount} className="camera-form" data-testid="form-count-snapshot">
                  <input type="number" min="0" step="1" required className="field" placeholder="Số lượng" aria-label="Số lượng tổng hợp" value={count} onChange={(e) => setCount(e.target.value)} data-testid="input-estimated-count" />
                  <input type="number" min="0" max="1" step="0.01" required className="field" aria-label="Độ tin cậy" value={confidence} onChange={(e) => setConfidence(e.target.value)} data-testid="input-count-confidence" />
                  <button className="btn secondary" type="submit" disabled={createCount.isPending} data-testid="button-save-count">{createCount.isPending ? <LoaderCircle /> : <Plus />} Lưu số đếm thủ công</button>
                </form>
                </details>
                  </>
                )}
                {createCount.isError && <div className="error-banner" role="alert">{errorText(createCount.error)}</div>}
                {createCount.isSuccess && <div className="success-banner" data-testid="status-count-saved">Đã lưu số đếm tham khảo. Giáo viên cần xác nhận mọi chênh lệch.</div>}
                <div className="privacy-strip"><strong>Chỉ xử lý số đếm.</strong> Khung hình được xử lý trong trình duyệt; chỉ số đếm và độ tin cậy được gửi, không lưu hình ảnh hay danh tính.</div>
              </div>
            </aside>
          </div>
        </>
      ) : <EmptyState title="Không tìm thấy buổi học" detail="Buổi học có thể đã bị xóa hoặc mã không chính xác." />}
    </main>
  );
}

function CheckInRow({ record, pending, onUpdate }: { record: AttendanceRecord; pending: boolean; onUpdate: (status: 'present' | 'late' | 'absent') => void }) {
  return (
    <tr data-testid={`row-checkin-${record.id}`}>
      <td><div className="student-name">{record.studentName}</div><div className="student-code">{record.studentCode}</div></td>
      <td>{dateTime(record.checkedInAt)}</td>
      <td><span className={`pill ${record.status === 'absent' ? 'review' : record.status === 'late' ? 'closed' : ''}`}>{record.status === 'present' ? 'Có mặt' : record.status === 'late' ? 'Muộn' : 'Vắng'}</span></td>
      <td><select className="select-field" aria-label={`Điều chỉnh trạng thái ${record.studentName}`} value={record.status} disabled={pending} onChange={(e) => onUpdate(e.target.value as 'present' | 'late' | 'absent')} data-testid={`select-record-status-${record.id}`}><option value="present">Có mặt</option><option value="late">Muộn</option><option value="absent">Vắng</option></select></td>
    </tr>
  );
}

export function CheckInPage() {
  const qc = useQueryClient();
  const searchToken = new URLSearchParams(window.location.search).get('token') ?? '';
  const sessions = useListAttendanceSessions();
  const checkIn = useCreateSessionCheckIn();
  const [studentId, setStudentId] = useState('');
  const [token, setToken] = useState(searchToken);
  const [submittedRecord, setSubmittedRecord] = useState<AttendanceRecord | null>(null);
  const [submitError, setSubmitError] = useState('');
  const activeSession = useMemo(() => (sessions.data ?? []).find((session) => session.status === 'active' && session.qrToken === token.trim()), [sessions.data, token]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitError('');
    setSubmittedRecord(null);
    if (!activeSession) {
      setSubmitError('Không tìm thấy buổi học đang mở cho mã QR này. Hãy quét lại mã mới nhất hoặc hỏi giáo viên.');
      return;
    }
     checkIn.mutate({ sessionId: activeSession.id, data: { studentCode: studentId.trim(), qrToken: token.trim() } }, {
      onSuccess: (record) => {
        setSubmittedRecord(record);
        void qc.invalidateQueries({ queryKey: getListAttendanceSessionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAttendanceOverviewQueryKey() });
        void qc.invalidateQueries({ queryKey: getListSessionCheckInsQueryKey(activeSession.id) });
        void qc.invalidateQueries({ queryKey: getGetAttendanceSessionQueryKey(activeSession.id) });
        void qc.invalidateQueries({ queryKey: getGetSessionReconciliationQueryKey(activeSession.id) });
      },
      onError: (error) => setSubmitError(errorText(error)),
    });
  };
  return (
    <main className="page-wrap">
      <div className="checkin-wrap">
        <div className="checkin-brand"><span className="brand-icon">Đ</span><div><div className="brand-name">Điểm danh</div><div className="brand-caption" style={{ color: '#65756d' }}>Cổng xác nhận học sinh</div></div></div>
        <section className="card checkin-card">
          <div className="eyebrow">Xác nhận có mặt</div>
          <h1>Chào bạn, sẵn sàng điểm danh?</h1>
          <p className="page-subtitle">Nhập mã học sinh và mã phiên được giáo viên chia sẻ. Kết quả chỉ được xác nhận khi hệ thống phản hồi thành công.</p>
          {sessions.isLoading && <div style={{ marginTop: 17 }}><LoadingState label="Đang kiểm tra phiên điểm danh…" /></div>}
          {sessions.isError && <ErrorState error={sessions.error} retry={() => void sessions.refetch()} />}
          <form className="form-stack" onSubmit={submit} data-testid="form-student-checkin">
             <label><span className="form-label">Mã học sinh</span><input className="field" required value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Ví dụ: HS1001" data-testid="input-student-id" /><span className="form-help">Sử dụng mã học sinh được trường cấp, không nhập họ tên.</span></label>
            <label><span className="form-label">Mã QR / mã phiên</span><input className="field" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="Mã được điền từ liên kết QR" data-testid="input-checkin-token" /><span className="form-help">{activeSession ? `Phiên đang mở: ${activeSession.className} · ${activeSession.subject}` : 'Mở liên kết từ mã QR để tự điền mã phiên.'}</span></label>
            {submitError && <div className="error-banner" role="alert" data-testid="status-checkin-error">{submitError}</div>}
            {submittedRecord && <div className="success-banner" role="status" data-testid="status-checkin-success"><strong>Máy chủ đã xác nhận điểm danh.</strong><br />{submittedRecord.studentName} · {submittedRecord.studentCode} · {dateTime(submittedRecord.checkedInAt)}</div>}
            <button type="submit" className="btn" disabled={checkIn.isPending || sessions.isLoading || sessions.isError} data-testid="button-submit-checkin">{checkIn.isPending ? <LoaderCircle /> : <CheckCheck />} Gửi xác nhận</button>
          </form>
          <div className="privacy-strip" style={{ marginTop: 18 }}><strong>Không cần tài khoản.</strong> Dữ liệu gửi trực tiếp đến hệ thống điểm danh của lớp.</div>
        </section>
      </div>
    </main>
  );
}

export function ReportsPage() {
  const [classId, setClassId] = useState('');
  const queryParams = useMemo(() => classId ? { classId: Number(classId) } : undefined, [classId]);
  const report = useGetAttendanceReport(queryParams, { query: { queryKey: getGetAttendanceReportQueryKey(queryParams) } });
  const classes = useListClasses();
  const exportCsv = () => {
    if (!report.data) return;
    const csvRows = [['Lớp', 'Sĩ số', 'Tỷ lệ có mặt', 'Số buổi'], ...report.data.rows.map((row) => [row.className, String(row.studentCount), `${row.attendanceRate.toFixed(1)}%`, String(row.sessionsCount)])];
    const csv = '\uFEFF' + csvRows.map((row) => row.map((item) => `"${item.replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bao-cao-diem-danh.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="page-wrap">
      <PageHeading eyebrow="Theo dõi chuyên cần" title="Báo cáo điểm danh" subtitle="Nhìn lại nhịp tham gia theo lớp qua các buổi đã ghi nhận." action={<button className="btn secondary" onClick={exportCsv} disabled={!report.data?.rows.length} data-testid="button-export-report"><Download /> Tải CSV</button>} />
      <div className="filter-bar">
        <div className="toolbar"><span className="form-label" style={{ margin: 0 }}>Lọc theo lớp</span><select className="select-field" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="select-report-class"><option value="">Tất cả lớp</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.subject}</option>)}</select></div>
        <button className="icon-button" onClick={() => { void report.refetch(); void classes.refetch(); }} aria-label="Làm mới báo cáo" data-testid="button-refresh-report"><RefreshCw /></button>
      </div>
      {report.isLoading ? <LoadingState label="Đang tổng hợp báo cáo…" /> : report.isError ? <ErrorState error={report.error} retry={() => void report.refetch()} /> : (
        <>
          <section className="report-headline" data-testid="report-summary">
            <div><div className="eyebrow">Toàn bộ phạm vi đã chọn</div><div className="report-stat">{report.data?.overallAttendanceRate.toFixed(1) ?? '0.0'}%</div><div className="report-sub">Tỷ lệ có mặt trung bình</div></div>
            <div className="report-side"><FileBarChart2 size={24} style={{ marginBottom: 8 }} /><br /><strong>{report.data?.totalSessions ?? 0}</strong> buổi học đã ghi nhận</div>
          </section>
          <section className="card section-card">
            <div className="section-head"><div><h2>Chuyên cần theo lớp</h2><div className="section-kicker">Số liệu từ các phiên điểm danh đã kết thúc</div></div><span className="subject-chip">{report.data?.rows.length ?? 0} LỚP</span></div>
            {!report.data?.rows.length ? <EmptyState title="Chưa có dữ liệu báo cáo" detail="Báo cáo sẽ xuất hiện sau khi có buổi điểm danh được ghi nhận." /> : (
              <div className="table-wrap"><table><thead><tr><th>Lớp học</th><th>Học sinh</th><th>Tỷ lệ có mặt</th><th>Số buổi</th><th>Xu hướng</th></tr></thead><tbody>
                {report.data.rows.map((row) => <tr key={row.classId} data-testid={`row-report-${row.classId}`}><td><div className="student-name">{row.className}</div><div className="student-code">Mã lớp {row.classId}</div></td><td>{row.studentCount}</td><td><div className="rate">{row.attendanceRate.toFixed(1)}%</div><div className="meter" style={{ width: 105 }}><span style={{ width: `${Math.max(0, Math.min(100, row.attendanceRate))}%` }} /></div></td><td>{row.sessionsCount}</td><td>{row.attendanceRate >= (report.data?.overallAttendanceRate ?? 0) ? <span className="pill"><ArrowUpRight size={12} /> Trên TB</span> : <span className="pill closed"><ArrowDownRight size={12} /> Dưới TB</span>}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
          <p className="notice" style={{ marginTop: 15 }}>Báo cáo chỉ tổng hợp dữ liệu điểm danh đã được xác nhận. Số đếm tham khảo từ camera không thay thế trạng thái từng học sinh.</p>
        </>
      )}
    </main>
  );
}
