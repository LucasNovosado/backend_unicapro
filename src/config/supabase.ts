import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Função para validar e obter variáveis de ambiente
function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Validação das variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não encontradas:');
  missing.forEach(varName => console.error(`   - ${varName}`));
  console.error('\n💡 Certifique-se de que todas as variáveis estão configuradas no Easypanel.');
  throw new Error(`Missing Supabase environment variables: ${missing.join(', ')}`);
}

// Validar formato da URL do Supabase
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  console.error('❌ ERRO: SUPABASE_URL deve começar com http:// ou https://');
  throw new Error('Invalid SUPABASE_URL format');
}

// Após validação, garantir que são strings (type assertion para TypeScript)
const SUPABASE_URL: string = supabaseUrl;
const SUPABASE_SERVICE_ROLE_KEY: string = supabaseServiceKey;
const SUPABASE_ANON_KEY: string = supabaseAnonKey;

// Log de confirmação (sem expor as chaves)
console.log('✅ Supabase configurado:', {
  url: SUPABASE_URL,
  hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
  hasAnonKey: !!SUPABASE_ANON_KEY
});

// Cliente com service role (para operações administrativas)
// Usar as constantes validadas e tipadas para garantir type safety
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Cliente público (para login de usuários)
export const supabasePublic = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper para obter Supabase client com token do usuário
export const getSupabaseClient = (token: string) => {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );
};
