import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase-server.js";

/**
 * Autenticacao unica das rotas do painel da clinica.
 *
 * Existe porque este bloco estava copiado em agenda-listar, config-salvar,
 * painel-acoes e painel-view. As quatro copias divergiram no `select` de
 * `perfis` e isso causou dois 500 em producao: uma rota lia `perfil.nome`
 * sem ter selecionado a coluna, outra lia `perfil.id` idem. Um select so,
 * num lugar so, remove a classe inteira de bug.
 *
 * Retorna `{ erro: { status, corpo } }` em qualquer falha, ou
 * `{ supabase, admin, perfil }` em caso de sucesso. Quem precisa redirecionar
 * em vez de responder JSON (painel-view) trata o `erro` do seu jeito e usa o
 * `supabase` devolvido para encerrar a sessao.
 */
export async function autenticarClinica(req, res) {
  let supabase;
  try {
    supabase = createSupabaseServerClient(req, res);
  } catch {
    return { erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } } };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    return { supabase, erro: { status: 401, corpo: { erro: "nao_autenticado" } } };
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { supabase, erro: { status: 500, corpo: { erro: "supabase_nao_configurado" } } };
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Uniao das colunas que as rotas do painel consomem. Ampliar aqui, nunca
  // num select local, senao a divergencia que causou os 500 volta.
  const { data: perfil } = await admin
    .from("perfis")
    .select("id,papel,clinica_id,nome,ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !perfil ||
    perfil.papel !== "clinica" ||
    !perfil.ativo ||
    !perfil.clinica_id
  ) {
    return { supabase, admin, erro: { status: 403, corpo: { erro: "sem_permissao" } } };
  }

  return { supabase, admin, perfil };
}
