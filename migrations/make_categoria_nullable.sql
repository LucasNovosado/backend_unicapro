-- Migration: Tornar coluna categoria nullable em estoque_produtos
-- Esta migration permite que a coluna categoria seja NULL, já que agora usamos categoria_id

-- Remover a constraint CHECK que limita os valores
ALTER TABLE estoque_produtos 
DROP CONSTRAINT IF EXISTS estoque_produtos_categoria_check;

-- Tornar a coluna categoria nullable
ALTER TABLE estoque_produtos 
ALTER COLUMN categoria DROP NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN estoque_produtos.categoria IS 'Categoria antiga (mantida por compatibilidade - pode ser NULL e aceita qualquer valor da tabela estoque_categorias)';
