import { Link, useLocation } from 'wouter';
import { BookOpenCheck, ClipboardList, LayoutDashboard, ChartNoAxesCombined, CalendarCheck, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/classes', label: 'Lớp học', icon: BookOpenCheck },
  { href: '/reports', label: 'Báo cáo', icon: ChartNoAxesCombined },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
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
        <div className="nav-label">Không gian giảng dạy</div>
        <nav>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-link ${active(href) ? 'active' : ''}`} data-testid={`link-nav-${label}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="nav-label" style={{ marginTop: 18 }}>Lối tắt</div>
        <Link href="/check-in" className={`nav-link ${active('/check-in') ? 'active' : ''}`} data-testid="link-nav-checkin">
          <CalendarCheck />
          <span>Biểu mẫu điểm danh</span>
        </Link>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <strong><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Quyền riêng tư</strong>
            <p>Camera chỉ ghi nhận số lượng tổng hợp. Không nhận diện hay lưu danh tính.</p>
          </div>
          <div className="teacher-chip">
            <div className="teacher-avatar">GV</div>
            <div>
              <div className="teacher-name">Không gian giáo viên</div>
              <div className="teacher-role">Bảng điều khiển lớp học</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="mobile-brand"><span className="brand-icon">Đ</span><span>Điểm danh</span></div>
            <span className="breadcrumb">Trường học <span style={{ margin: '0 7px' }}>/</span> Không gian giáo viên</span>
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
          <Link href="/check-in" className={`nav-link ${active('/check-in') ? 'active' : ''}`} data-testid="mobile-nav-check-in">
            <ClipboardList /><span>Điểm danh</span>
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
