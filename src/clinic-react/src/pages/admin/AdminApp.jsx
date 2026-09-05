import React from 'react';
import {
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AdminLayout } from './Admin';
import Clinicas from './Clinicas';
import Usuarios from './Usuarios';
import Metricas from './Metricas';
import Convites from './Convites';
import Logs from './Auditoria';
import Home from './Home';
import CadastrarClinica from './CadastrarClinica';
import UsuarioView from './UsuarioView';
import UsuariosEdicao from './UsuariosEdicao';

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Home />} />
        <Route path="clinicas" element={<Clinicas />} />
        <Route path="clinicas/nova" element={<CadastrarClinica />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="usuarios/:id" element={<UsuarioView />} />
        <Route path="usuarios/:id/edit" element={<UsuariosEdicao />} />
        <Route path="metricas" element={<Metricas />} />
        <Route path="convites" element={<Convites />} />
        <Route path="auditoria" element={<Logs />} />
        <Route path="conversas" element={
          <AdminLayout>
            <div className="panel-header">
              <h1>Conversas</h1>
              <p className="panel-desc">Monitoramento de atendimentos em tempo real.</p>
            </div>
            <div className="panel-body">
              <p className="vazio">Em breve — painel de conversas em tempo real.</p>
            </div>
          </AdminLayout>
        } />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
