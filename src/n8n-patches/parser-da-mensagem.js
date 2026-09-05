// ══════════════════════════════════════════════════════════════
// Parser da Mensagem — n8n Code node
// ══════════════════════════════════════════════════════════════
//
// COLE ESTE CÓDIGO no node "Parser da Mensagem" do workflow
// cxn5FxUNMJmlJ1WJ (Recepta AI - Atendimento WhatsApp).
//
// O que este node faz:
// 1. Extrai telefone e mensagem do body do webhook UazAPI
// 2. Para mensagens de MÍDIA: salva JSON completo em mensagem_media
//    e um texto legível em mensagem (ex: "[imagem] foto.jpg")
// 3. Para mensagens de TEXTO: mantém o comportamento atual
// 4. O campo mensagem é o que vai para o prompt do Claude (limpo)
// 5. O campo mensagem_media é o que vai para o Supabase (display)
//
// ══════════════════════════════════════════════════════════════

const body = $input.first().json.body || $input.first().json;
const instanceKey = $input.first().json.instancekey || body.instancekey || '';

// Extrair telefone (remove @s.whatsapp.net se presente)
let rawPhone = body.from || body.chatid || body.remoteJid || '';
let telefone = rawPhone.replace(/@s\.whatsapp\.net.*/, '').replace(/\D/g, '');

// Se tem DDI 55 no início, manter; senão, adicionar
if (telefone.length >= 10 && !telefone.startsWith('55')) {
  telefone = '55' + telefone;
}

// ── Detectar tipo de mensagem ──
const msgType = (body.messagetype || body.messageType || '').toLowerCase();
const text = body.text || body.caption || '';
const fileUrl = body.fileurl || body.fileURL || body.url || null;
const mimetype = body.mimetype || body.mimeType || null;
const filename = body.filename || body.fileName || '';
const seconds = body.seconds || body.duration || null;
const isSticker = body.issticker === true || body.isSticker === true;

// ── É mídia? ──
const isMedia = ['image', 'video', 'audio', 'document', 'sticker'].some(
  t => msgType.includes(t)
) || (mimetype && mimetype !== 'text/plain');

let mensagem = '';
let mensagem_media = null;

if (isMedia && (fileUrl || mimetype)) {
  // ── MENSAGEM DE MÍDIA ──
  // Montar JSON completo para mensagem_media
  mensagem_media = {};
  if (mimetype) mensagem_media.mimetype = mimetype;
  if (fileUrl) mensagem_media.URL = fileUrl;
  if (filename) mensagem_media.filename = filename;
  if (seconds) mensagem_media.seconds = seconds;
  if (isSticker) mensagem_media.isSticker = true;

  // Determinar tipo legível para o campo mensagem
  let tipoLegivel = 'mídia';
  if (isSticker) {
    tipoLegivel = 'sticker';
  } else if (mimetype && mimetype.startsWith('image')) {
    tipoLegivel = 'imagem';
  } else if (mimetype && mimetype.startsWith('video')) {
    tipoLegivel = 'vídeo';
  } else if (mimetype && mimetype.startsWith('audio')) {
    tipoLegivel = 'áudio';
  } else if (mimetype && mimetype.includes('pdf')) {
    tipoLegivel = 'documento PDF';
  } else if (mimetype && mimetype.includes('document')) {
    tipoLegivel = 'documento';
  }

  // Campo mensagem = texto legível para o Claude ver
  // Se tem caption, usar ele; senão, usar o label do tipo
  if (text && text.trim()) {
    mensagem = text.trim();
  } else {
    mensagem = '[' + tipoLegivel + ']';
  }
} else {
  // ── MENSAGEM DE TEXTO ──
  mensagem = text || '';
  mensagem_media = null;
}

// ── Extrair nomes de participantes (se disponível) ──
const pushName = body.pushname || body.pushName || '';
const groupName = body.groupname || body.groupName || '';

return [{
  json: {
    telefone,
    mensagem,
    mensagem_media,
    instancekey: instanceKey,
    pushname: pushName,
    groupname: groupName,
    messagetype: msgType,
    original: body,
  },
}];
