-- Migration: Adicionar coluna 'ativo' na tabela estoque_solicitacoes
-- Permite desativar solicitações sem excluí-las (soft delete)

-- ============================================
-- 1. Adicionar coluna 'ativo' na tabela estoque_solicitacoes
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'estoque_solicitacoes' 
    AND column_name = 'ativo'
  ) THEN
    ALTER TABLE estoque_solicitacoes 
    ADD COLUMN ativo BOOLEAN DEFAULT true NOT NULL;
    
    -- Criar índice para melhor performance em filtros
    CREATE INDEX IF NOT EXISTS idx_estoque_solicitacoes_ativo 
    ON estoque_solicitacoes(ativo);
    
    -- Comentário na coluna
    COMMENT ON COLUMN estoque_solicitacoes.ativo IS 'Indica se a solicitação está ativa. Solicitações desativadas não aparecem nas listagens padrão.';
  END IF;
END $$;

-- ============================================
-- 2. Atualizar todas as solicitações existentes para ativo = true
-- ============================================
UPDATE estoque_solicitacoes 
SET ativo = true 
WHERE ativo IS NULL;
