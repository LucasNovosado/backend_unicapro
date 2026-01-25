-- Tabela de Categorias de Produtos
CREATE TABLE IF NOT EXISTS estoque_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca
CREATE INDEX IF NOT EXISTS idx_estoque_categorias_nome ON estoque_categorias(nome);
CREATE INDEX IF NOT EXISTS idx_estoque_categorias_ativo ON estoque_categorias(ativo);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_estoque_categorias_updated_at
  BEFORE UPDATE ON estoque_categorias
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inserir categorias padrão (opcional)
INSERT INTO estoque_categorias (nome, descricao, ativo) VALUES
  ('grafico', 'Materiais gráficos e impressos', true),
  ('brindes', 'Brindes e materiais promocionais', true),
  ('estrutura_lojas', 'Estruturas e materiais para lojas', true)
ON CONFLICT (nome) DO NOTHING;

-- Comentários
COMMENT ON TABLE estoque_categorias IS 'Categorias de produtos do estoque';
COMMENT ON COLUMN estoque_categorias.nome IS 'Nome único da categoria';
COMMENT ON COLUMN estoque_categorias.descricao IS 'Descrição opcional da categoria';
COMMENT ON COLUMN estoque_categorias.ativo IS 'Indica se a categoria está ativa';
