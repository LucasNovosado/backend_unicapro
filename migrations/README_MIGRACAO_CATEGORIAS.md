# Migração de Categorias - Estático para Tabela

Este documento descreve como migrar as categorias de produtos de valores estáticos para uma tabela dedicada.

## 📋 O que será feito

1. **Criar tabela `estoque_categorias`** - Tabela para armazenar categorias
2. **Adicionar coluna `categoria_id`** na tabela `estoque_produtos`
3. **Criar categorias** baseadas nas categorias existentes nos produtos
4. **Vincular produtos** às categorias criadas
5. **Atualizar código** para usar `categoria_id` ao invés de `categoria` (string)

## 🗄️ Passo 1: Executar Migration SQL

Execute o arquivo SQL no seu banco de dados Supabase:

```bash
# Via Supabase Dashboard:
# 1. Acesse o SQL Editor
# 2. Cole o conteúdo de: backend/migrations/migrate_categorias_to_table.sql
# 3. Execute o script
```

Ou via CLI do Supabase:

```bash
supabase db execute -f backend/migrations/migrate_categorias_to_table.sql
```

## 🔄 Passo 2: Executar Script de Migração de Dados

Execute o script TypeScript para migrar os dados existentes:

```bash
cd backend
npx tsx scripts/migrate-categorias.ts
```

## ✅ Verificação

Após executar a migração, verifique:

1. **Categorias criadas:**
   ```sql
   SELECT * FROM estoque_categorias;
   ```

2. **Produtos vinculados:**
   ```sql
   SELECT 
     p.id,
     p.nome,
     p.categoria as categoria_antiga,
     c.nome as categoria_nova
   FROM estoque_produtos p
   LEFT JOIN estoque_categorias c ON p.categoria_id = c.id
   LIMIT 10;
   ```

3. **Produtos sem categoria:**
   ```sql
   SELECT COUNT(*) 
   FROM estoque_produtos 
   WHERE categoria_id IS NULL AND categoria IS NOT NULL;
   ```

## 🔧 Mudanças no Código

### Backend
- ✅ Controller de produtos atualizado para usar `categoria_id`
- ✅ Controller de estoque atualizado para usar `categoria_id`
- ✅ Schemas de validação atualizados
- ✅ Suporte para compatibilidade com campo `categoria` antigo

### Frontend
- ✅ Componente Produtos atualizado para buscar categorias da API
- ✅ Componente Estoque atualizado para usar categorias da API
- ✅ Tipos TypeScript atualizados

## 📝 Notas Importantes

1. **Compatibilidade:** O código mantém suporte para o campo `categoria` antigo durante a transição
2. **Coluna antiga:** A coluna `categoria` na tabela `estoque_produtos` é mantida por enquanto (pode ser removida depois)
3. **Validação:** Novos produtos devem usar `categoria_id` (UUID)
4. **Filtros:** Filtros por categoria agora usam `categoria_id` ou nome da categoria

## 🚀 Após a Migração

Após confirmar que tudo está funcionando:

1. Teste criar um novo produto com categoria
2. Teste editar um produto existente
3. Teste filtrar produtos por categoria
4. Verifique se os produtos antigos aparecem corretamente

## ⚠️ Rollback (se necessário)

Se precisar reverter:

```sql
-- Remover coluna categoria_id
ALTER TABLE estoque_produtos DROP COLUMN IF EXISTS categoria_id;

-- Remover tabela de categorias (CUIDADO: perde dados!)
-- DROP TABLE IF EXISTS estoque_categorias CASCADE;
```
