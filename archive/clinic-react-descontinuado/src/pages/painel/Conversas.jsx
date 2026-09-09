import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { fetchConversas } from '../../api/painel';
import s from '../admin/Admin.module.scss';

/* ── Media detection (ported from vanilla JS panel) ── */
function detectarMidia(text, mediaJson) {
  // First check dedicated media column (new format)
  if (mediaJson && typeof mediaJson === 'object') {
    const m = mediaJson.mimetype || mediaJson.mimeType;
    const u = mediaJson.URL || mediaJson.url;
    if (m || u) {
      if (String(m).startsWith('audio')) {
        return { tipo: 'audio', icone: '🎤', label: 'Áudio' + (mediaJson.seconds ? ' · ' + Math.round(mediaJson.seconds) + 's' : ''), url: u || null };
      }
      if (mediaJson.isSticker === true || String(m) === 'image/webp') {
        return { tipo: 'sticker', icone: '🏷️', label: 'Sticker', url: u || null };
      }
      if (String(m).startsWith('image')) {
        return { tipo: 'imagem', icone: '🖼️', label: 'Imagem', url: u || null };
      }
      if (String(m).startsWith('video')) {
        return { tipo: 'video', icone: '🎬', label: 'Vídeo', url: u || null };
      }
      return { tipo: 'documento', icone: '📎', label: 'Documento', url: u || null };
    }
  }
  // Fallback: parse JSON from mensagem text (legacy format)
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object') return null;
    const m = o.mimetype || o.mimeType;
    const u = o.URL || o.url;
    const k = o.mediaKey || o.mediaKeyBase64;
    if (!m && !u && !k) return null;

    if (String(m).startsWith('audio')) {
      return {
        tipo: 'audio',
        icone: '🎤',
        label: 'Áudio' + (o.seconds ? ' · ' + Math.round(o.seconds) + 's' : ''),
        url: u || null,
      };
    }
    if (o.isSticker === true || String(m) === 'image/webp') {
      return { tipo: 'sticker', icone: '🏷️', label: 'Sticker', url: u || null };
    }
    if (String(m).startsWith('image')) {
      return { tipo: 'imagem', icone: '🖼️', label: 'Imagem', url: u || null };
    }
    if (String(m).startsWith('video')) {
      return { tipo: 'video', icone: '🎬', label: 'Vídeo', url: u || null };
    }
    return { tipo: 'documento', icone: '📎', label: 'Documento', url: u || null };
  } catch {
    return null;
  }
}

/* ── Format phone ── */
function formatarTelefone(tel) {
  if (!tel) return '';
  const d = tel.replace(/\D/g, '');
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 5)}${d.slice(5, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel;
}

/* ── Format time ── */
function formatarHora(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ── Inline Editable Name ── */
function EditableName({ telefone, nomeInicial, onSave }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(nomeInicial || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setName(nomeInicial || '');
  }, [nomeInicial]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = name.trim();
    setEditing(false);
    onSave?.(trimmed);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={s.editableInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') { setName(nomeInicial || ''); setEditing(false); }
        }}
        placeholder="Nome do paciente…"
        maxLength={60}
      />
    );
  }

  const displayName = name || formatarTelefone(telefone);
  return (
    <span className={s.editableName} onClick={() => setEditing(true)} title="Clique para renomear">
      {name && <span className={s.nameBadge}>👤</span>}
      {displayName}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, marginLeft: 4 }}>
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </span>
  );
}

/* ── Chat Bubble ── */
function ChatBubble({ msg }) {
  const midia = detectarMidia(msg.mensagem, msg.mensagem_media);
  const isIa = msg.role === 'ia';

  return (
    <div className={`${s.chatRow} ${isIa ? s.chatRowIa : s.chatRowPaciente}`}>
      <div className={`${s.chatAutor} ${isIa ? s.autorIa : s.autorPaciente}`}>
        {isIa ? 'Recepta' : 'Paciente'}
      </div>
      <div className={`${s.chatBubble} ${isIa ? s.bubbleIa : s.bubblePaciente}`}>
        {midia ? (
          <div className={s.midiaChip}>
            {midia.tipo === 'imagem' && midia.url ? (
              <a href={midia.url} target="_blank" rel="noopener noreferrer" className={s.midiaLink}>
                <img src={midia.url} alt="Imagem" className={s.midiaThumb} onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.textContent = '⏰ Mídia expirada'; }} />
                <span className={s.midiaLabel}>{midia.icone} {midia.label}</span>
              </a>
            ) : midia.tipo === 'video' && midia.url ? (
              <a href={midia.url} target="_blank" rel="noopener noreferrer" className={s.midiaLink}>
                <video src={midia.url} className={s.midiaThumb} muted preload="metadata" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.textContent = '⏰ Mídia expirada'; }} />
                <span className={s.midiaLabel}>{midia.icone} {midia.label}</span>
              </a>
            ) : midia.tipo === 'audio' && midia.url ? (
              <div className={s.midiaAudio}>
                <audio src={midia.url} controls className={s.audioPlayer} preload="metadata" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.textContent = '⏰ Mídia expirada'; }} />
                <span className={s.midiaLabel}>{midia.icone} {midia.label}</span>
              </div>
            ) : (
              <span className={s.midiaLabel}>{midia.icone} {midia.label}</span>
            )}
          </div>
        ) : (
          <span className={s.chatTexto}>{msg.mensagem}</span>
        )}
      </div>
      <div className={s.chatHora}>{formatarHora(msg.criado_em)}</div>
    </div>
  );
}

/* ── Main Component ── */
export default function Conversas() {
  const [conversas, setConversas] = useState([]);
  const [pausadas, setPausadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');
  const [telefoneSelecionado, setTelefoneSelecionado] = useState(null);
  const [nomesCustomizados, setNomesCustomizados] = useState({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const result = await fetchConversas();
      if (!mounted) return;
      if (result.ok) {
        setConversas(result.body.conversas || []);
        setPausadas(result.body.pausadas || []);
        setError('');
      } else {
        setError('Não foi possível carregar as conversas.');
      }
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Build name map from nome_cliente in the conversation data
  useEffect(() => {
    const nomes = {};
    conversas.forEach(c => {
      if (c.nome_cliente) nomes[c.telefone] = c.nome_cliente;
    });
    setNomesCustomizados(nomes);
  }, [conversas]);

  const conversasFiltradas = useMemo(() => {
    if (!busca.trim()) return conversas;
    const q = busca.toLowerCase();
    return conversas.filter(
      (c) => {
        const nome = c.nome_cliente || nomesCustomizados[c.telefone] || '';
        return c.telefone?.includes(q) ||
          c.mensagem?.toLowerCase().includes(q) ||
          nome.toLowerCase().includes(q);
      },
    );
  }, [conversas, busca, nomesCustomizados]);

  // Group by phone
  const porTelefone = useMemo(() => {
    const map = {};
    for (const c of conversasFiltradas) {
      if (!map[c.telefone]) map[c.telefone] = [];
      map[c.telefone].push(c);
    }
    return Object.entries(map).sort((a, b) => {
      const lastA = a[1][a[1].length - 1]?.criado_em || '';
      const lastB = b[1][b[1].length - 1]?.criado_em || '';
      return lastB.localeCompare(lastA);
    });
  }, [conversasFiltradas]);

  const thread = telefoneSelecionado
    ? conversas.filter((c) => c.telefone === telefoneSelecionado)
    : [];

  // Scroll to bottom when thread opens
  useEffect(() => {
    if (telefoneSelecionado && chatEndRef.current) {
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [telefoneSelecionado, thread.length]);

  const handleNameSave = useCallback((tel, newName) => {
    fetch('/api/clinica/painel-acoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'salvar_nome_cliente', telefone: tel, nome: newName }),
    }).then(r => r.json()).then(res => {
      if (res.ok) {
        setNomesCustomizados(prev => {
          const next = { ...prev };
          if (newName) next[tel] = newName;
          else delete next[tel];
          return next;
        });
        // Refresh to get updated nome_cliente from backend
        fetchConversas().then(result => {
          if (result.ok) setConversas(result.body.conversas || []);
        });
      }
    }).catch(() => {});
  }, []);

  function getPreview(msgs) {
    const ultima = msgs[msgs.length - 1];
    if (!ultima) return '—';
    const midia = detectarMidia(ultima.mensagem, ultima.mensagem_media);
    if (midia) return midia.icone + ' ' + midia.label;
    return ultima.mensagem || '—';
  }

  return (
    <>
      <div className="panel-header">
        <h1>Monitoramento</h1>
        <p className="panel-desc">Acompanhe as conversas dos pacientes com a Recepta.</p>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="field-input"
            placeholder="Buscar por telefone, nome ou mensagem…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>

        {error && (
          <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{error}</div>
        )}

        <div className="section-card">
          {loading ? (
            <p className={s.vazio}>Carregando conversas…</p>
          ) : porTelefone.length === 0 ? (
            <p className={s.vazio}>Nenhuma conversa encontrada.</p>
          ) : (
            porTelefone.map(([tel, msgs]) => {
              const isPausada = pausadas.includes(tel);
              const nomeCustom = msgs[msgs.length - 1]?.nome_cliente || nomesCustomizados[tel] || '';
              return (
                <div
                  key={tel}
                  className={`conv-card ${isPausada ? 'conv-pausada' : ''}`}
                  onClick={() => setTelefoneSelecionado(tel)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setTelefoneSelecionado(tel)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {nomeCustom && <span style={{ fontSize: '11px' }}>👤</span>}
                        <span>{nomeCustom || formatarTelefone(tel)}</span>
                        {nomeCustom && <span style={{ fontWeight: 400, fontSize: '12px', color: '#94a3b8' }}> · {formatarTelefone(tel)}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getPreview(msgs)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {isPausada && <span className="badge badge-orange">Pausada</span>}
                      <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {formatarHora(msgs[msgs.length - 1]?.criado_em)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat thread modal */}
      {telefoneSelecionado && (
        <div className="modal-overlay" onClick={() => setTelefoneSelecionado(null)}>
          <div className="modal-content modal-chat" onClick={(e) => e.stopPropagation()}>
            <div className="chat-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <EditableName
                  telefone={telefoneSelecionado}
                  nomeInicial={nomesCustomizados[telefoneSelecionado] || ''}
                  onSave={(name) => handleNameSave(telefoneSelecionado, name)}
                />
                <p className="modal-sub">{thread.length} mensagens</p>
              </div>
              <button className="chat-close" onClick={() => setTelefoneSelecionado(null)}>✕</button>
            </div>
            <div className="chat-thread">
              {thread.slice().reverse().map((msg) => (
                <ChatBubble key={msg.id} msg={msg} />
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
