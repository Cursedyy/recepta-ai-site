import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useDarkMode } from '../../hooks/useDarkMode';
import s from './Admin.module.scss';

/* ═══ SVG Icons ═══ */
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  clinics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  metrics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  invites: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  ),
  audit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const SECTIONS = [
  {
    label: 'Principal',
    links: [
      { label: 'Dashboard', to: '/admin', icon: Icons.dashboard, end: true },
      { label: 'Conversas', to: '/admin/conversas', icon: Icons.chat, badge: '3' },
    ],
  },
  {
    label: 'Gestão',
    links: [
      { label: 'Clínicas', to: '/admin/clinicas', icon: Icons.clinics },
      { label: 'Novo Cadastro', to: '/admin/clinicas/nova', icon: Icons.plus },
      { label: 'Usuários', to: '/admin/usuarios', icon: Icons.users },
      { label: 'Convites', to: '/admin/convites', icon: Icons.invites },
    ],
  },
  {
    label: 'Insights',
    links: [
      { label: 'Métricas', to: '/admin/metricas', icon: Icons.metrics },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { label: 'Auditoria', to: '/admin/auditoria', icon: Icons.audit },
    ],
  },
];

export function SidebarAdmin({ onClose }) {
  const { dark, toggle } = useDarkMode();

  return (
    <nav className={s.sidebar}>
      {/* Logo */}
      <div className={s.sidebarLogo}>
        <div className={s.sidebarLogoIcon}>R</div>
        <div className={s.sidebarLogoText}>
          <span>ReceptaAI</span>
          <span>Painel Admin</span>
        </div>
        {/* Close button — visible only on mobile */}
        <button
          className={s.sidebarClose}
          onClick={onClose}
          aria-label="Fechar menu"
        >
          {Icons.close}
        </button>
      </div>

      {/* Navigation */}
      <div className={s.sidebarNav}>
        {SECTIONS.map((section) => (
          <div key={section.label} className={s.sidebarSection}>
            <div className={s.sidebarSectionLabel}>{section.label}</div>
            {section.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `${s.sidebarLink} ${isActive ? s.active : ''}`
                }
                onClick={onClose}
              >
                {link.icon}
                {link.label}
                {link.badge && (
                  <span className={s.sidebarLinkBadge}>{link.badge}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {/* Footer: Dark Mode Toggle + User */}
      <div className={s.sidebarFooter}>
        {/* Dark Mode Toggle */}
        <button
          className={s.darkToggle}
          onClick={toggle}
          title={dark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
        >
          <span className={s.darkToggleTrack}>
            <span className={`${s.darkToggleThumb} ${dark ? s.dark : ''}`}>
              {dark ? Icons.moon : Icons.sun}
            </span>
          </span>
          <span className={s.darkToggleLabel}>
            {dark ? 'Modo Escuro' : 'Modo Claro'}
          </span>
        </button>

        <div className={s.sidebarUser}>
          <div className={s.sidebarAvatar}>AD</div>
          <div className={s.sidebarUserInfo}>
            <div className={s.name}>Admin</div>
            <div className={s.role}>Administrador</div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function AdminLayout({ children }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeSidebar = useCallback(() => setMobileOpen(false), []);

  // Auto-close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const breadcrumb = location.pathname
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' / ');

  return (
    <div className={s.adminLayout}>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className={s.sidebarOverlay}
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — always rendered, CSS handles visibility */}
      <div className={`${s.sidebarWrapper} ${mobileOpen ? s.open : ''}`}>
        <SidebarAdmin onClose={closeSidebar} />
      </div>

      <div className={s.adminMain}>
        {/* Top Bar */}
        <div className={s.adminTopbar}>
          <div className={s.adminTopbarLeft}>
            {/* Hamburger — visible only on mobile */}
            <button
              className={s.hamburger}
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {mobileOpen ? Icons.close : Icons.menu}
            </button>
            <div className={s.adminTopbarTitle}>
              {Icons.globe}
              <span>{breadcrumb || 'Dashboard'}</span>
            </div>
          </div>
          <div className={s.adminTopbarActions}>
            <button className="btn btn-ghost btn-sm" style={{ position: 'relative' }}>
              {Icons.bell}
              <span className={s.notifDot} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={s.adminContent}>
          {children || <Outlet />}
        </div>
      </div>
    </div>
  );
}
