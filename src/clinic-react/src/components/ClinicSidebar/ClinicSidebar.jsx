import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import s from './ClinicSidebar.module.scss';

const SECTIONS = [
  {
    label: 'Clínica',
    links: [
      { label: 'Agenda', to: '/panel', icon: '📋', end: true },
      { label: 'Horários', to: '/panel/horarios', icon: '🕐' },
      { label: 'Preços', to: '/panel/precos', icon: '💰' },
      { label: 'Convênios', to: '/panel/convenios', icon: '🏥' },
    ],
  },
  {
    label: 'Recepta',
    links: [
      { label: 'Mensagem', to: '/panel/mensagem', icon: '💬' },
      { label: 'Conversas', to: '/panel/conversas', icon: '🗨️' },
    ],
  },
  {
    label: 'Conta',
    links: [
      { label: 'Pausa', to: '/panel/pausa', icon: '⏸️' },
      { label: 'Perfil', to: '/panel/perfil', icon: '👤' },
      { label: 'Feriados', to: '/panel/feriados', icon: '📅' },
      { label: 'Status', to: '/panel/status', icon: '📊' },
    ],
  },
];

export function ClinicSidebar() {
  return (
    <nav className={s.root}>
      <div className={s.logo}>
        <svg viewBox="0 0 100 100" fill="currentColor" width="22" height="22">
          <g transform="translate(0, 50)">
            <path d="M 34 -34 C -1.7 -15.9, -1.7 15.9, 34 34 C 69.7 15.9, 69.7 -15.9, 34 -34 Z" fillOpacity="0.6" />
            <path d="M 66 -34 C 30.3 -15.9, 30.3 15.9, 66 34 C 101.7 15.9, 101.7 -15.9, 66 -34 Z" />
          </g>
        </svg>
        <span className={s.logoTitle}>Recepta</span>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.label} className={s.section}>
          <div className={s.sectionLabel}>{section.label}</div>
          {section.links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `${s.navItem} ${isActive ? s.navItemActive : ''}`
              }
            >
              <span className={s.navIcon}>{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function ClinicLayout({ children }) {
  return (
    <div className={s.layout}>
      <ClinicSidebar />
      <main className={s.main}>
        {children || <Outlet />}
      </main>
    </div>
  );
}
