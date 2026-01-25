-- Migration: Migrar categorias estáticas para tabela estoque_categorias
-- Este script:
-- 1. Cria a tabela estoque_categorias se não existir
-- 2. Adiciona coluna categoria_id na tabela estoque_produtos
-- 3. Cria categorias baseadas nas categorias existentes nos produtos
-- 4. Vincula produtos às categorias criadas
-- 5. Mantém coluna categoria antiga por compatibilidade (pode ser removida depois)

-- ============================================
-- 1. Criar tabela estoque_categorias (se não existir)
-- ============================================
CREATE TABLE IF NOT EXISTS estoque_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_estoque_categorias_nome ON estoque_categorias(nome);
CREATE INDEX IF NOT EXISTS idx_estoque_categorias_ativo ON estoque_categorias(ativo);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_estoque_categorias_updated_at ON estoque_categorias;
CREATE TRIGGER update_estoque_categorias_updated_at
  BEFORE UPDATE ON estoque_categorias
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. Adicionar coluna categoria_id na tabela estoque_produtos
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'estoque_produtos' 
    AND column_name = 'categoria_id'
  ) THEN
    ALTER TABLE estoque_produtos 
    ADD COLUMN categoria_id UUID REFERENCES estoque_categorias(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_estoque_produtos_categoria_id 
    ON estoque_produtos(categoria_id);
  END IF;
END $$;

-- ============================================
-- 3. Criar categorias baseadas nas categorias existentes nos produtos
-- ============================================
-- Inserir categorias únicas dos produtos existentes
INSERT INTO estoque_categorias (nome, descricao, ativo)
SELECT DISTINCT
  categoria as nome,
  CASE 
    WHEN categoria = 'grafico' THEN 'Materiais gráficos e impressos'
    WHEN categoria = 'brindes' THEN 'Brindes e materiais promocionais'
    WHEN categoria = 'estrutura_lojas' THEN 'Estruturas e materiais para lojas'
    ELSE 'Categoria de produtos'
  END as descricao,
  true as ativo
FROM estoque_produtos
WHERE categoria IS NOT NULL
  AND categoria NOT IN (SELECT nome FROM estoque_categorias)
ON CONFLICT (nome) DO NOTHING;

-- ============================================
-- 4. Vincular produtos existentes às categorias criadas
-- ============================================
UPDATE estoque_produtos p
SET categoria_id = c.id
FROM estoque_categorias c
WHERE p.categoria = c.nome
  AND p.categoria_id IS NULL;

-- ============================================
-- 5. Verificar se há produtos sem categoria vinculada
-- ============================================
DO $$
DECLARE
  produtos_sem_categoria INTEGER;
BEGIN
  SELECT COUNT(*) INTO produtos_sem_categoria
  FROM estoque_produtos
  WHERE categoria_id IS NULL AND categoria IS NOT NULL;
  
  IF produtos_sem_categoria > 0 THEN
    RAISE NOTICE 'Atenção: % produtos não foram vinculados a categorias', produtos_sem_categoria;
  END IF;
END $$;

-- ============================================
-- 6. Comentários e documentação
-- ============================================
COMMENT ON TABLE estoque_categorias IS 'Categorias de produtos do estoque';
COMMENT ON COLUMN estoque_categorias.nome IS 'Nome único da categoria';
COMMENT ON COLUMN estoque_categorias.descricao IS 'Descrição opcional da categoria';
COMMENT ON COLUMN estoque_categorias.ativo IS 'Indica se a categoria está ativa';

COMMENT ON COLUMN estoque_produtos.categoria_id IS 'Referência à categoria do produto (substitui coluna categoria estática)';
COMMENT ON COLUMN estoque_produtos.categoria IS 'Categoria antiga (mantida por compatibilidade - pode ser removida depois)';

-- ============================================
-- 7. View para facilitar consultas (opcional)
-- ============================================
CREATE OR REPLACE VIEW vw_produtos_com_categoria AS
SELECT 
  p.*,
  c.nome as categoria_nome,
  c.descricao as categoria_descricao,
  c.ativo as categoria_ativo
FROM estoque_produtos p
LEFT JOIN estoque_categorias c ON p.categoria_id = c.id;

COMMENT ON VIEW vw_produtos_com_categoria IS 'View que retorna produtos com informações da categoria';
