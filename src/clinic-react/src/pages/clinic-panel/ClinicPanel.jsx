import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ClinicLayout } from '../../components/ClinicSidebar/ClinicSidebar';
import Agenda from '../painel/Agenda';
import Horarios from '../painel/Horarios';
import Precos from '../painel/Precos';
import Convenios from '../painel/Convenios';
import Mensagem from '../painel/Mensagem';
import Conversas from '../painel/Conversas';
import Pausa from '../painel/Pausa';
import Perfil from '../painel/Perfil';
import Feriados from '../painel/Feriados';
import Status from '../painel/Status';
import s from '../admin/Admin.module.scss';

export default function ClinicPanel() {
  const location = useLocation();

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '24px',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#ffffff',
          border: '1.5px solid #e2e8f0',
          borderRadius: '14px',
          padding: '10px 18px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.06)',
        }}
      >
        <button className={s.btn + ' ' + s.btnPrimary}>Salvar alterações</button>
        <span id="status-salvar"></span>
      </div>

      <Routes location={location}>
        <Route element={<ClinicLayout />}>
          <Route index element={<Agenda />} />
          <Route path="horarios" element={<Horarios />} />
          <Route path="precos" element={<Precos />} />
          <Route path="convenios" element={<Convenios />} />
          <Route path="mensagem" element={<Mensagem />} />
          <Route path="conversas" element={<Conversas />} />
          <Route path="pausa" element={<Pausa />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="feriados" element={<Feriados />} />
          <Route path="status" element={<Status />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Route>
      </Routes>
    </>
  );
}
