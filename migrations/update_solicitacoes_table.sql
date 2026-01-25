-- Migração: Remover campo prazo_necessario_em e adicionar campo referencias
-- Data: 2025-01-25

-- Remover coluna prazo_necessario_em (se existir)
ALTER TABLE estoque_solicitacoes 
DROP COLUMN IF EXISTS prazo_necessario_em;

-- Adicionar coluna referencias para armazenar links WebM/WebP das imagens de referência
-- Usando JSONB para armazenar array de strings (links)
ALTER TABLE estoque_solicitacoes 
ADD COLUMN IF NOT EXISTS referencias JSONB DEFAULT '[]'::jsonb;

-- Comentário na coluna
COMMENT ON COLUMN estoque_solicitacoes.referencias IS 'Array de links (data URLs) das imagens de referência convertidas para WebM/WebP (máximo 10 imagens)';

-- Criar índice GIN para busca eficiente em arrays JSONB (opcional, mas útil para queries)
CREATE INDEX IF NOT EXISTS idx_estoque_solicitacoes_referencias ON estoque_solicitacoes USING GIN (referencias);
