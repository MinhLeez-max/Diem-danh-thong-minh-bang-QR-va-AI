import ClerkApiTokenBridge from "./components/ClerkApiTokenBridge";
import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { CheckInPage, ClassesPage, DashboardPage, ReportsPage, SessionPage } from '@/pages/workspace-pages';
import { AdminUsersPage } from '@/pages/admin-users-page';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect, Link } from 'wouter';
import { getGetCurrentSchoolUserQueryKey, useGetCurrentSchoolUser, useGetStudentAttendance, getGetStudentAttendanceQueryKey } from '@workspace/api-client-react';
import { BookOpenCheck, ClipboardCheck, GraduationCap, ShieldCheck } from 'lucide-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = String(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '');
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
const clerkAppearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: { colorPrimary: '#28675d', colorForeground: '#203b3d', colorMutedForeground: '#667774', colorDanger: '#a64238', colorBackground: '#fbf9f1', colorInput: '#fffdf7', colorInputForeground: '#203b3d', colorNeutral: '#d5d0c4', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbf9f1] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#203b3d] font-bold', headerSubtitle: 'text-[#667774]', socialButtonsBlockButtonText: 'text-[#203b3d] font-semibold',
    formFieldLabel: 'text-[#203b3d] font-semibold', footerActionLink: 'text-[#28675d] font-semibold', footerActionText: 'text-[#667774]',
    dividerText: 'text-[#667774]', identityPreviewEditButton: 'text-[#28675d]', formFieldSuccessText: 'text-[#28675d]',
    alertText: 'text-[#8f382f]', logoBox: 'rounded-xl', logoImage: 'rounded-xl', socialButtonsBlockButton: 'border-[#d5d0c4]',
    formButtonPrimary: 'bg-[#28675d] hover:bg-[#1f554d]', formFieldInput: 'border-[#d5d0c4] bg-[#fffdf7] text-[#203b3d]',
    footerAction: 'border-0', dividerLine: 'bg-[#d5d0c4]', alert: 'border-[#e7c4b7] bg-[#f8e6df]',
    otpCodeFieldInput: 'border-[#d5d0c4] bg-[#fffdf7]', formFieldRow: '', main: '',
  },
};

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) client.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function AuthPages({ signUp = false }: { signUp?: boolean }) {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  const checkInReturn = returnTo?.startsWith('/check-in?token=') && !returnTo.startsWith('//')
    ? `${basePath}${returnTo}`
    : undefined;
  return <div className="signin-wrap"><div className="signin-brand"><span className="brand-icon">Đ</span><span><span className="brand-name">Điểm danh</span><span className="brand-caption" style={{ color: '#65756d' }}>Sổ lớp thông minh</span></span></div>
    <div>{signUp ? <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={checkInReturn} fallbackRedirectUrl={`${basePath}/`} /> : <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={checkInReturn} fallbackRedirectUrl={`${basePath}/`} />}
      <p className="signin-note">Tài khoản đầu tiên sẽ trở thành quản trị viên trường. Các tài khoản tiếp theo chờ quản trị viên phân quyền.</p>
    </div>
  </div>;
}

function HomePage() {
  const { isSignedIn, isLoaded } = useAuth();
  const user = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  if (isSignedIn) {
    if (!isLoaded || user.isLoading) return <main className="page-wrap"><div className="loading-row">Đang mở không gian trường học…</div></main>;
    if (user.data?.role === 'admin') return <AppShell><DashboardPage /></AppShell>;
    if (user.data?.role === 'teacher') return <Redirect to="/classes" />;
    if (user.data?.role === 'student') return <Redirect to="/student" />;
    if (user.isError) return <main className="page-wrap"><div className="error-banner">Chưa thể tải hồ sơ trường học. <button className="text-link" onClick={() => void user.refetch()}>Thử lại</button></div></main>;
    return <Redirect to="/waiting" />;
  }
  return <main className="page-wrap">
    <section className="welcome-panel">
      <div className="eyebrow" style={{ color: '#e9cf91' }}>Không gian điểm danh của nhà trường</div>
      <h1>Đi học đủ. Ghi nhận rõ. An tâm hơn.</h1>
      <p>Một sổ lớp số gọn gàng để giáo viên mở phiên điểm danh, quản trị viên điều phối tài khoản và học sinh xác nhận có mặt bằng QR.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
        <Link href="/sign-up" className="btn" data-testid="link-get-started">Tạo tài khoản trường <BookOpenCheck size={15} /></Link>
        <Link href="/sign-in" className="btn secondary" data-testid="link-sign-in">Đăng nhập</Link>
      </div>
    </section>
    <div className="role-grid">
      <article className="role-tile"><GraduationCap color="#28675d" /><strong>Dành cho giáo viên</strong><p>Quản lý danh sách lớp, mở phiên QR và theo dõi xác nhận theo thời gian thực.</p></article>
      <article className="role-tile"><ShieldCheck color="#a07732" /><strong>Dành cho quản trị viên</strong><p>Phân vai trò, liên kết học sinh với hồ sơ lớp và phân công lớp cho giáo viên.</p></article>
      <article className="role-tile"><ClipboardCheck color="#28675d" /><strong>Dành cho học sinh</strong><p>Quét mã QR của lớp. Không cần camera nhận diện, chỉ dùng tài khoản trường được liên kết.</p></article>
    </div>
    <div className="privacy-strip" style={{ marginTop: 18 }}><strong>Quyền riêng tư là mặc định.</strong> Camera chỉ hỗ trợ tham khảo sĩ số tổng hợp; không nhận diện khuôn mặt, không suy luận danh tính và không lưu khung hình.</div>
  </main>;
}

function StudentHistory() {
  const history = useGetStudentAttendance({ query: { queryKey: getGetStudentAttendanceQueryKey(), refetchInterval: 30_000 } });
  const statusText = { present: 'Có mặt', late: 'Đi muộn', absent: 'Vắng' };
  return <section className="card section-card" style={{ marginTop: 20 }}>
    <div className="section-head"><div><h2>Lịch sử điểm danh</h2><div className="section-kicker">100 lượt ghi nhận gần nhất của riêng bạn</div></div><button className="btn secondary" onClick={() => void history.refetch()}>Làm mới</button></div>
    {history.isLoading ? <p>Đang tải lịch sử…</p> : history.isError ? <div className="error-banner" role="alert">Không thể tải lịch sử điểm danh. Hãy thử làm mới.</div> : !history.data?.length ? <p className="notice">Bạn chưa có lượt điểm danh nào được ghi nhận.</p> :
      <div className="table-wrap"><table><thead><tr><th>Buổi học</th><th>Lớp · Môn học</th><th>Trạng thái</th><th>Giờ điểm danh</th></tr></thead><tbody>{history.data.map(entry => <tr key={entry.id}><td>{new Date(entry.startedAt).toLocaleString('vi-VN')}</td><td>{entry.className} · {entry.subject}</td><td>{statusText[entry.status]}</td><td>{entry.checkedInAt ? new Date(entry.checkedInAt).toLocaleString('vi-VN') : '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}

function StudentHome() {
  const { isSignedIn } = useAuth();
  const current = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  const [, setLocation] = useLocation();
  if (current.isLoading) return <main className="page-wrap"><div className="loading-row">Đang tải thông tin học sinh…</div></main>;
  if (current.isError) return <main className="page-wrap"><div className="error-banner">Chưa thể tải tài khoản. <button className="text-link" onClick={() => void current.refetch()}>Thử lại</button></div></main>;
  return <main className="page-wrap student-home">
    <div className="eyebrow">Không gian học sinh</div><h1>Chào {current.data?.studentName || current.data?.displayName || 'bạn'}.</h1>
    <p className="page-subtitle">Mã học sinh {current.data?.studentCode || 'chưa được liên kết'}{current.data?.studentName ? ` · ${current.data.studentName}` : ''}</p>
    <section className="card section-card" style={{ marginTop: 22 }}>
      <div className="section-head"><div><h2>Điểm danh buổi học</h2><div className="section-kicker">Quét mã QR do giáo viên hiển thị để xác nhận có mặt</div></div><span className="subject-chip">QR AN TOÀN</span></div>
      {current.data?.studentId ? <><p className="page-subtitle" style={{ lineHeight: 1.7 }}>Khi quét mã, hệ thống sẽ tự xác nhận bằng tài khoản đã liên kết với hồ sơ lớp của bạn.</p><div className="token-card"><strong>Mã học sinh</strong><div className="student-code">{current.data.studentCode}</div></div></> :
        <div className="notice">Tài khoản của bạn chưa được liên kết với hồ sơ học sinh. Hãy nhờ quản trị viên kết nối tài khoản trước khi điểm danh.</div>}
    </section>
    {current.data?.role === 'student' && current.data.studentId && <StudentHistory />}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}><span className="page-subtitle">Không dùng nhận diện khuôn mặt hoặc lưu hình ảnh.</span><button className="btn ghost" onClick={() => setLocation('/sign-in')}>Đăng nhập lại</button></div>
  </main>;
}

function WaitingPage() {
  const { isSignedIn } = useAuth();
  const current = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  return <main className="page-wrap" style={{ maxWidth: 760 }}>
    <section className="card section-card" style={{ padding: 'clamp(24px,5vw,42px)' }}>
      <div className="empty-icon"><ShieldCheck /></div><div className="eyebrow" style={{ textAlign: 'center' }}>Tài khoản đang chờ</div>
      <h1 style={{ textAlign: 'center' }}>Quản trị viên sẽ sớm cấp quyền.</h1>
      <p className="page-subtitle" style={{ textAlign: 'center', lineHeight: 1.7 }}>Tài khoản <strong>{current.data?.email ?? ''}</strong> đã đăng ký thành công. Sau khi được phân vai trò giáo viên hoặc học sinh, bạn sẽ thấy không gian phù hợp tại đây.</p>
      <div className="notice" style={{ marginTop: 20 }}>Đây là bước thiết lập bảo vệ dữ liệu học sinh. Việc chờ duyệt không ảnh hưởng đến trạng thái đăng nhập.</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}><LogoutButton /></div>
    </section>
  </main>;
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button className="btn secondary" onClick={() => void signOut({ redirectUrl: basePath || '/' })}>Đăng xuất</button>;
}

function RoleGate({ children, roles }: { children: ReactNode; roles: string[] }) {
  const { isSignedIn, isLoaded } = useAuth();
  const current = useGetCurrentSchoolUser({ query: { enabled: !!isSignedIn, queryKey: getGetCurrentSchoolUserQueryKey() } });
  if (!isLoaded || (isSignedIn && current.isLoading)) return <main className="page-wrap"><div className="loading-row">Đang xác thực quyền truy cập…</div></main>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (current.isError) return <main className="page-wrap"><div className="error-banner">Không thể xác minh quyền truy cập. <button className="text-link" onClick={() => void current.refetch()}>Thử lại</button></div></main>;
  if (!current.data || current.data.role === 'pending') return <Redirect to="/waiting" />;
  if (!roles.includes(current.data.role)) return <Redirect to={current.data.role === 'admin' ? '/admin/users' : current.data.role === 'student' ? '/student' : '/classes'} />;
  return <AppShell>{children}</AppShell>;
}

function StaffPage({ children }: { children: ReactNode }) { return <RoleGate roles={['admin', 'teacher']}>{children}</RoleGate>; }
function AdminPage() { return <RoleGate roles={['admin']}><AdminUsersPage /></RoleGate>; }
function TeacherPage({ children }: { children: ReactNode }) { return <RoleGate roles={['teacher', 'admin']}>{children}</RoleGate>; }
function RootRouter() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Chào mừng trở lại', subtitle: 'Đăng nhập vào tài khoản trường học' } }, signUp: { start: { title: 'Tạo tài khoản trường học', subtitle: 'Bắt đầu sử dụng sổ lớp thông minh' } } }}
    routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
    <ClerkApiTokenBridge>
      <ClerkQueryClientCacheInvalidator />
      <RoutedErrorBoundary><Switch>
      <Route path="/" component={HomePage} />
      <Route path="/sign-in/*?" component={() => <AuthPages />} />
      <Route path="/sign-up/*?" component={() => <AuthPages signUp />} />
      <Route path="/check-in" component={CheckInPage} />
      <Route path="/waiting" component={WaitingPage} />
      <Route path="/student" component={StudentHome} />
      <Route path="/admin/users" component={AdminPage} />
      <Route path="/classes" component={() => <TeacherPage><ClassesPage /></TeacherPage>} />
      <Route path="/sessions/:sessionId" component={() => <StaffPage><SessionPage /></StaffPage>} />
      <Route path="/reports" component={() => <StaffPage><ReportsPage /></StaffPage>} />
      <Route component={NotFound} />
      </Switch></RoutedErrorBoundary>
    </ClerkApiTokenBridge>
  </ClerkProvider>;
}

function NotFound() { return <main className="page-wrap"><h1>Không tìm thấy trang</h1><p className="page-subtitle">Địa chỉ này không tồn tại trong không gian trường học.</p><Link href="/" className="btn" style={{ marginTop: 16 }}>Về trang chủ</Link></main>; }

function App() {
  if (!clerkPubKey) return <main className="page-wrap"><section className="card section-card"><h1>Đăng nhập chưa được cấu hình</h1><p className="page-subtitle">Nhà trường cần hoàn tất cấu hình đăng nhập trước khi sử dụng hệ thống. Vui lòng liên hệ quản trị viên.</p></section></main>;
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><RootRouter /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
