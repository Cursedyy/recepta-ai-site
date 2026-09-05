import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginClinica } from '../../api/auth-clinica';
import s from '../auth/login/Login.module.scss';

export default function ClinicLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const result = await loginClinica({
      email: email.trim(),
      senha: password,
    });

    setLoading(false);

    if (result.ok) {
      navigate('/panel', { replace: true });
      return;
    }

    const msg =
      result.body?.mensagem ||
      result.body?.erro ||
      'E-mail ou senha incorretos.';

    setErrorMsg(msg);
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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
