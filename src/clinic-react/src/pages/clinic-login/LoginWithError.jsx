import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClinicLogin from './ClinicLogin';
import EstadoInvalido from './EstadoInvalido';
import s from '../auth/login/Login.module.scss';

export default function LoginWithError() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState('');

  function handleMessage(msg) {
    setErrorMsg(msg || 'Algo deu errado ao entrar.');
  }

  return (
    <div className={s.authPage}>
      <div className={s.widgetAuth}>
        <div className={s.logoBlock}>
          <p>Recepta AI</p>
        </div>
        <h1 className={s.authHeader}>Painel da clínica</h1>
        <p>Acesso restrito. Entre com seu e-mail e senha.</p>

        {errorMsg && <div className="erro">{errorMsg}</div>}

        <ClinicLogin onMessage={handleMessage} />
      </div>
    </div>
  );
}
