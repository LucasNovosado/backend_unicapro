import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateCategorias() {
  console.log('🚀 Iniciando migração de categorias...\n');

  try {
    // 1. Verificar se tabela estoque_categorias existe
    console.log('1. Verificando tabela estoque_categorias...');
    const { data: tableExists } = await supabase
      .from('estoque_categorias')
      .select('id')
      .limit(1);

    if (!tableExists) {
      console.log('   ⚠️  Tabela estoque_categorias não existe. Execute a migration SQL primeiro!');
      return;
    }
    console.log('   ✅ Tabela existe\n');

    // 2. Verificar se coluna categoria_id existe
    console.log('2. Verificando coluna categoria_id...');
    const { data: produtos } = await supabase
      .from('estoque_produtos')
      .select('id, categoria')
      .limit(1);

    if (!produtos || produtos.length === 0) {
      console.log('   ⚠️  Nenhum produto encontrado');
      return;
    }

    // Verificar se categoria_id existe (tentando buscar)
    const { data: testProduto } = await supabase
      .from('estoque_produtos')
      .select('categoria_id')
      .limit(1);

    if (testProduto === null) {
      console.log('   ⚠️  Coluna categoria_id não existe. Execute a migration SQL primeiro!');
      return;
    }
    console.log('   ✅ Coluna existe\n');

    // 3. Buscar categorias únicas dos produtos
    console.log('3. Buscando categorias únicas dos produtos...');
    const { data: produtosComCategoria } = await supabase
      .from('estoque_produtos')
      .select('categoria')
      .not('categoria', 'is', null);

    if (!produtosComCategoria || produtosComCategoria.length === 0) {
      console.log('   ⚠️  Nenhum produto com categoria encontrado');
      return;
    }

    const categoriasUnicas = [...new Set(produtosComCategoria.map(p => p.categoria))];
    console.log(`   ✅ Encontradas ${categoriasUnicas.length} categorias únicas: ${categoriasUnicas.join(', ')}\n`);

    // 4. Criar categorias que não existem
    console.log('4. Criando categorias...');
    for (const categoriaNome of categoriasUnicas) {
      const descricao = categoriaNome === 'grafico' 
        ? 'Materiais gráficos e impressos'
        : categoriaNome === 'brindes'
        ? 'Brindes e materiais promocionais'
        : categoriaNome === 'estrutura_lojas'
        ? 'Estruturas e materiais para lojas'
        : 'Categoria de produtos';

      const { data: categoriaExistente } = await supabase
        .from('estoque_categorias')
        .select('id')
        .eq('nome', categoriaNome)
        .single();

      if (!categoriaExistente) {
        const { data: novaCategoria, error } = await supabase
          .from('estoque_categorias')
          .insert({
            nome: categoriaNome,
            descricao,
            ativo: true
          })
          .select()
          .single();

        if (error) {
          console.error(`   ❌ Erro ao criar categoria ${categoriaNome}:`, error.message);
        } else {
          console.log(`   ✅ Categoria criada: ${categoriaNome} (${novaCategoria.id})`);
        }
      } else {
        console.log(`   ℹ️  Categoria já existe: ${categoriaNome}`);
      }
    }
    console.log('');

    // 5. Buscar todas as categorias criadas
    console.log('5. Buscando categorias criadas...');
    const { data: todasCategorias } = await supabase
      .from('estoque_categorias')
      .select('id, nome');

    if (!todasCategorias) {
      console.log('   ❌ Erro ao buscar categorias');
      return;
    }

    const categoriasMap = new Map(todasCategorias.map(c => [c.nome, c.id]));
    console.log(`   ✅ ${todasCategorias.length} categorias disponíveis\n`);

    // 6. Vincular produtos às categorias
    console.log('6. Vinculando produtos às categorias...');
    let vinculados = 0;
    let semCategoria = 0;

    for (const categoriaNome of categoriasUnicas) {
      const categoriaId = categoriasMap.get(categoriaNome);
      if (!categoriaId) {
        console.log(`   ⚠️  Categoria ${categoriaNome} não encontrada`);
        continue;
      }

      const { data: produtosParaVincular } = await supabase
        .from('estoque_produtos')
        .select('id')
        .eq('categoria', categoriaNome)
        .is('categoria_id', null);

      if (produtosParaVincular && produtosParaVincular.length > 0) {
        const { error } = await supabase
          .from('estoque_produtos')
          .update({ categoria_id: categoriaId })
          .eq('categoria', categoriaNome)
          .is('categoria_id', null);

        if (error) {
          console.error(`   ❌ Erro ao vincular produtos da categoria ${categoriaNome}:`, error.message);
        } else {
          vinculados += produtosParaVincular.length;
          console.log(`   ✅ ${produtosParaVincular.length} produtos vinculados à categoria ${categoriaNome}`);
        }
      }
    }

    // Verificar produtos sem categoria_id
    const { data: produtosSemCategoria } = await supabase
      .from('estoque_produtos')
      .select('id')
      .is('categoria_id', null)
      .not('categoria', 'is', null);

    if (produtosSemCategoria) {
      semCategoria = produtosSemCategoria.length;
    }

    console.log(`\n   ✅ Total vinculado: ${vinculados} produtos`);
    if (semCategoria > 0) {
      console.log(`   ⚠️  ${semCategoria} produtos ainda sem categoria_id`);
    }
    console.log('');

    // 7. Resumo final
    console.log('7. Resumo da migração:');
    const { data: produtosFinais } = await supabase
      .from('estoque_produtos')
      .select('id, categoria_id', { count: 'exact' });

    const totalProdutos = produtosFinais?.length || 0;
    const produtosComCategoriaId = produtosFinais?.filter(p => p.categoria_id).length || 0;

    console.log(`   📊 Total de produtos: ${totalProdutos}`);
    console.log(`   ✅ Produtos com categoria_id: ${produtosComCategoriaId}`);
    console.log(`   ⚠️  Produtos sem categoria_id: ${totalProdutos - produtosComCategoriaId}`);
    console.log('\n✅ Migração concluída!');

  } catch (error: any) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  }
}

migrateCategorias();
