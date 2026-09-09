import React, { useState } from 'react';
import { atualizarPerfil } from '../../api/painel';
import s from '../admin/Admin.module.scss';

export default function Perfil() {
  const [nome, setNome] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erros, setErros] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function handleSalvar(e) {
    e.preventDefault();
    setErros([]);
    setSucesso(false);
    setSaving(true);

    const dados = {};
    if (nome.trim()) dados.nome = nome.trim();
    if (senhaAtual && novaSenha) {
      dados.senha_atual = senhaAtual;
      dados.nova_senha = novaSenha;
    }

    if (Object.keys(dados).length === 0) {
      setErros(['Preencha ao menos um campo para salvar.']);
      setSaving(false);
      return;
    }

    const result = await atualizarPerfil(dados);
    setSaving(false);

    if (result.ok) {
      setSucesso(true);
      setSenhaAtual('');
      setNovaSenha('');
      setNome('');
      setTimeout(() => setSucesso(false), 3000);
    } else {
      const detalhes = result.body?.detalhes || [result.body?.erro || 'Erro ao salvar.'];
      setErros(Array.isArray(detalhes) ? detalhes : [detalhes]);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h1>Meu perfil</h1>
        <p className="panel-desc">Altere seu nome e senha de acesso.</p>
      </div>
      <div className="panel-body">
        <div className="section-card">
          <form onSubmit={handleSalvar}>
            <div className="field">
              <label className="field-label">Nome</label>
              <input
                type="text"
                className="field-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={100}
                placeholder="Seu nome"
              />
            </div>
            <div className="field">
              <label className="field-label">Senha atual</label>
              <input
                type="password"
                className="field-input"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label className="field-label">Nova senha</label>
              <input
                type="password"
                className="field-input"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                minLength={8}
                autoComplete="new-password"
              />
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Mínimo 8 caracteres. Deixe em branco para não alterar.
              </p>
            </div>

            {erros.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                {erros.map((err, i) => (
                  <div key={i} style={{ color: '#dc2626', fontSize: '12px' }}>{err}</div>
                ))}
              </div>
            )}

            {sucesso && (
              <div style={{ color: '#059669', fontSize: '12px', marginBottom: '10px' }}>
                Perfil salvo com sucesso!
              </div>
            )}

            <button
              className={s.btn + ' ' + s.btnPrimary}
              type="submit"
              disabled={saving}
            >
              {saving ? 'Salvando…' : 'Salvar perfil'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
