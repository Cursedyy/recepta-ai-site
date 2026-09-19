// ══════════════════════════════════════════════════════════════
// Parser da Mensagem — n8n Code node (RECONSTRUÍDO 2026-09-08)
// ══════════════════════════════════════════════════════════════
//
// Fonte da verdade: o código LIVE do workflow cxn5FxUNMJmlJ1WJ.
// Este arquivo substitui a versão corrompida (escapes duplicados) e a versão
// incompleta (sem tipo/token/telefone_alt) que quebraram o Atendimento.
// CONTRATO: emite tipo, token, telefone, telefone_alt, mensagem,
// mensagem_media, midia_tipo — remover qualquer um deles MATA o atendimento.
//
// ══════════════════════════════════════════════════════════════

const outer = $input.first().json;
const body = outer.body || outer;
const msg = body.message || body;
const instanceKey = outer.instancekey || body.instancekey || '';

// Token da instância (UazAPI manda no topo; caminho debounce manda dentro de body)
const token = body.token || outer.token || body.instanceToken || '';

// Telefone bruto (sem @s.whatsapp.net)
const rawFrom = msg.chatid || msg.remoteJid || body.from || body.chatid || '';
const rawDigits = String(rawFrom || '').replace(/@s\.whatsapp\.net.*/, '').replace(/\D/g, '');

// Normalização p/ 13 dígitos (mesma regra de 2026-09-04: 12->insere 9, 11->55, 10->55+9)
let telefone = rawDigits;
if (telefone.length === 12 && telefone.startsWith('55')) {
  telefone = telefone.slice(0, 4) + '9' + telefone.slice(4);
} else if (telefone.length === 11 && !telefone.startsWith('55')) {
  telefone = '55' + telefone;
} else if (telefone.length === 10) {
  telefone = '55' + telefone.slice(0, 2) + '9' + telefone.slice(2);
}
const telefone_alt = rawDigits;

// ── Regras de tipo (devolvidas: estavam no parser de 2026-09-04) ──
const fromMe = msg.fromMe === true || body.fromMe === true;
const wasSentByApi = msg.wasSentByApi === true || body.wasSentByApi === true;
let tipo;
if (fromMe && wasSentByApi) {
  tipo = 'ignorar';
} else if (fromMe && !wasSentByApi) {
  tipo = 'operador_manual';
} else {
  tipo = 'paciente';
}

// ── Mídia (patch 2026-09: mensagem_media p/ Supabase + mensagem legível) ──
const msgType = String(msg.messagetype || msg.messageType || body.messagetype || body.messageType || '').toLowerCase();
const text = msg.content ?? body.text ?? body.caption ?? '';
const fileUrl = msg.fileurl || msg.fileURL || body.fileurl || body.fileURL || body.url || null;
const mimetype = msg.mimetype || msg.mimeType || body.mimetype || body.mimeType || null;
const filename = msg.filename || msg.fileName || body.filename || body.fileName || '';
const seconds = msg.seconds || msg.duration || body.seconds || body.duration || null;
const isSticker = msg.issticker === true || msg.isSticker === true || body.issticker === true;

const isMedia = ['image', 'video', 'audio', 'document', 'sticker'].some(
  (t) => msgType.includes(t)
) || (mimetype && mimetype !== 'text/plain');

let mensagem = '';
let mensagem_media = null;
let midia_tipo = null;

if (isMedia && (fileUrl || mimetype)) {
  mensagem_media = {};
  if (mimetype) mensagem_media.mimetype = mimetype;
  if (fileUrl) mensagem_media.URL = fileUrl;
  if (filename) mensagem_media.filename = filename;
  if (seconds) mensagem_media.seconds = seconds;
  if (isSticker) mensagem_media.isSticker = true;

  midia_tipo = 'midia';
  if (isSticker) midia_tipo = 'sticker';
  else if (mimetype && mimetype.startsWith('image')) midia_tipo = 'imagem';
  else if (mimetype && mimetype.startsWith('video')) midia_tipo = 'video';
  else if (mimetype && mimetype.startsWith('audio')) midia_tipo = 'audio';
  else if (mimetype && mimetype.includes('pdf')) midia_tipo = 'documento';
  else if (mimetype && mimetype.includes('document')) midia_tipo = 'documento';

  mensagem = (text && String(text).trim()) ? String(text).trim() : '[' + midia_tipo + ']';
} else {
  mensagem = String(text || '');
}

// ── Nomes de participantes ──
const pushname = msg.pushname || msg.pushName || body.pushname || body.pushName || '';
const groupname = msg.groupname || msg.groupName || body.groupname || body.groupName || '';

return [{
  json: {
    tipo,
    token,
    telefone,
    telefone_alt,
    mensagem,
    mensagem_media,
    midia_tipo,
    instancekey: instanceKey,
    pushname,
    groupname,
    messagetype: msgType,
    original: body,
  },
}];
