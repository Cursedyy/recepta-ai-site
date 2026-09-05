import React from 'react';
import s from '../auth/login/Login.module.scss';

export default function EstadoInvalido() {
  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div className="modal-content" style={{ maxWidth: '380px', width: '100%', padding: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Estado inválido</h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
          Não foi possível carregar os dados da clínica.
        </p>
        <button
          className={s.btn + ' ' + s.btnPrimary}
          onClick={() => window.location.href = '/'}
        >
          Voltar para o login
        </button>
      </div>
    </div>
  );
}
