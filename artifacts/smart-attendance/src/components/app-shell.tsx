import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { BookOpenCheck, ClipboardList, LayoutDashboard, ChartNoAxesCombined, ShieldCheck, LogOut, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { getGetCurrentSchoolUserQueryKey, useGetCurrentSchoolUser } from '@workspace/api-client-react';

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const current = useGetCurrentSchoolUser();
  const role = current.data?.role ?? 'teacher';
  const navItems = role === 'admin'
    ? [{ href: '/', label: 'Tổng quan', icon: LayoutDashboard }, { href: '/classes', label: 'Lớp học', icon: BookOpenCheck }, { href: '/reports', label: 'Báo cáo', icon: ChartNoAxesCombined }, { href: '/admin/users', label: 'Tài khoản', icon: Users }]
    : [{ href: '/', label: 'Tổng quan', icon: LayoutDashboard }, { href: '/classes', label: 'Lớp học', icon: BookOpenCheck }, { href: '/reports', label: 'Báo cáo', icon: ChartNoAxesCombined }];
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  return (
    <div className="app-shell">
      <aside className="sidebar" data-testid="navigation-sidebar">
        <Link href="/" className="brand-mark" data-testid="link-brand-home">
          <span className="brand-icon">Đ</span>
          <span>
            <span className="brand-name">Điểm danh</span>
            <span className="brand-caption">Sổ lớp thông minh</span>
          </span>
        </Link>
        <div className="nav-label">{role === 'admin' ? 'Điều phối nhà trường' : 'Không gian giảng dạy'}</div>
        <nav>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`link-nav-${label}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <strong><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Quyền riêng tư</strong>
            <p>Camera chỉ ghi nhận số lượng tổng hợp. Không nhận diện hay lưu danh tính.</p>
          </div>
          <div className="teacher-chip">
            <div className="teacher-avatar">{role === 'admin' ? 'QT' : 'GV'}</div>
            <div>
              <div className="teacher-name">{current.data?.displayName || (role === 'admin' ? 'Quản trị viên' : 'Giáo viên')}</div>
              <div className="teacher-role">{role === 'admin' ? 'Quản trị nhà trường' : 'Không gian giảng dạy'}</div>
            </div>
          </div>
          <button className="nav-link" style={{ width: '100%', border: 0, background: 'transparent', marginTop: 8 }} onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })} data-testid="button-sign-out"><LogOut /><span>Đăng xuất</span></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="mobile-brand"><span className="brand-icon">Đ</span><span>Điểm danh</span></div>
            <span className="breadcrumb">Trường học <span style={{ margin: '0 7px' }}>/</span> {role === 'admin' ? 'Quản trị nhà trường' : 'Không gian giáo viên'}</span>
          </div>
          <div className="topbar-date" data-testid="text-current-date">
            {new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Điều hướng chính">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`mobile-nav-${label}`}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
          <button className="nav-link" style={{ border: 0, background: 'transparent' }} onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })} data-testid="mobile-button-sign-out"><ClipboardList /><span>Đăng xuất</span></button>
        </nav>
        {children}
      </div>
    </div>
  );
}
