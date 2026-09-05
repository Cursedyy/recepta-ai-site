import React, { useEffect, useState } from 'react';
import { fetchConfig } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Mensagem() {
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      const result = await fetchConfig();
      if (!mounted) return;

      if (result.ok && result.body.config?.mensagem_identidade != null) {
        setMensagem(result.body.config.mensagem_identidade);
      }
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, []);

  const contador = mensagem.length;

  if (loading) {
    return (
      <>
        <div className="panel-header">
          <h1>Mensagem de identidade</h1>
          <p className="panel-desc">Frase curta de boas-vindas que a Recepta usa ao iniciar conversa.</p>
        </div>
        <div className="panel-body">
          <p className={s.vazio}>Carregando…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="panel-header">
        <h1>Mensagem de identidade</h1>
        <p className="panel-desc">Frase curta de boas-vindas que a Recepta usa ao iniciar conversa.</p>
      </div>
      <div className="panel-body">
        <div className="section-card">
          <div className="field">
            <textarea
              className="field-input"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ex: Olá! Aqui é a secretária da Clínica Saúde+. Como posso ajudar?"
            />
            <div className="field-counter">
              <span>{contador}</span>/300
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
