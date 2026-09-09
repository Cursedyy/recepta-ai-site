import { createClient } from '@supabase/supabase-js';

export function buildSupabaseClient() {
  const config = window.__CONFIG__ || {};
  return createClient(config.url || '', config.anonKey || '');
}

export function buildAdminSupabaseClient() {
  const config = window.__ADMIN_CONFIG__ || {};
  return createClient(config.url || '', config.serviceKey || '');
}
