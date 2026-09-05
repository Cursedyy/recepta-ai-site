import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import s from './Layout.module.scss';

export default function Layout() {
  return (
    <div className={s.root}>
      <Sidebar />
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
