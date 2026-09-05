import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import s from './Sidebar.module.scss';

const NAV = [
  { header: 'Dashboard', icon: '🏠', link: '/panel' },
  { header: 'Clínica', icon: '🏥', link: '/panel' },
  { header: 'Administração', icon: '⚙️', link: '/admin' },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <nav className={s.root}>
      <header className={s.logo}>
        <span className={s.title}>Recepta</span>
      </header>
      <ul className={s.nav}>
        {NAV.map((item) => (
          <li key={item.link}>
            <Link to={item.link} className={s.navItem}>
              <span>{item.icon}</span>
              <span>{item.header}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
