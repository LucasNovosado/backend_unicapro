import { supabase } from '../src/config/supabase';

async function linkProductsToCentral() {
  try {
    console.log('🔍 Buscando estoque central...');
    
    // Buscar estoque central
    const { data: estoqueCentral, error: estoqueError } = await supabase
      .from('estoque_locais')
      .select('id, nome')
      .eq('tipo', 'central')
      .single();

    if (estoqueError || !estoqueCentral) {
      console.error('❌ Erro ao buscar estoque central:', estoqueError?.message);
      console.log('⚠️  Certifique-se de que existe um estoque local do tipo "central"');
      process.exit(1);
    }

    console.log(`✅ Estoque central encontrado: ${estoqueCentral.nome} (${estoqueCentral.id})`);

    // Buscar todos os produtos
    console.log('🔍 Buscando produtos...');
    const { data: produtos, error: produtosError } = await supabase
      .from('estoque_produtos')
      .select('id, nome, quantidade_disponivel')
      .eq('ativo', true);

    if (produtosError) {
      console.error('❌ Erro ao buscar produtos:', produtosError.message);
      process.exit(1);
    }

    console.log(`✅ Encontrados ${produtos?.length || 0} produtos`);

    if (!produtos || produtos.length === 0) {
      console.log('⚠️  Nenhum produto encontrado');
      process.exit(0);
    }

    // Buscar saldos existentes no estoque central
    console.log('🔍 Verificando saldos existentes...');
    const { data: saldosExistentes, error: saldosError } = await supabase
      .from('estoque_saldos')
      .select('produto_id')
      .eq('estoque_local_id', estoqueCentral.id);

    if (saldosError) {
      console.error('❌ Erro ao buscar saldos existentes:', saldosError.message);
      process.exit(1);
    }

    const produtosComSaldo = new Set(saldosExistentes?.map(s => s.produto_id) || []);
    console.log(`✅ Encontrados ${produtosComSaldo.size} produtos já vinculados ao estoque central`);

    // Filtrar produtos que ainda não têm saldo no estoque central
    const produtosParaVincular = produtos.filter(
      produto => !produtosComSaldo.has(produto.id)
    );

    console.log(`📦 Produtos que precisam ser vinculados: ${produtosParaVincular.length}`);

    if (produtosParaVincular.length === 0) {
      console.log('✅ Todos os produtos já estão vinculados ao estoque central!');
      process.exit(0);
    }

    // Criar saldos para produtos sem vínculo
    console.log('🔗 Criando vínculos com estoque central...');
    const saldosParaCriar = produtosParaVincular.map(produto => ({
      produto_id: produto.id,
      estoque_local_id: estoqueCentral.id,
      quantidade: produto.quantidade_disponivel || 0
    }));

    // Inserir em lotes de 100
    const batchSize = 100;
    let criados = 0;
    let erros = 0;

    for (let i = 0; i < saldosParaCriar.length; i += batchSize) {
      const batch = saldosParaCriar.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('estoque_saldos')
        .insert(batch);

      if (error) {
        console.error(`❌ Erro ao inserir lote ${Math.floor(i / batchSize) + 1}:`, error.message);
        erros += batch.length;
      } else {
        criados += batch.length;
        console.log(`✅ Lote ${Math.floor(i / batchSize) + 1} inserido: ${batch.length} saldos criados`);
      }
    }

    console.log('\n📊 Resumo da operação:');
    console.log(`- Saldos criados: ${criados}`);
    console.log(`- Erros: ${erros}`);
    console.log(`- Total de produtos vinculados ao estoque central: ${produtosComSaldo.size + criados}`);

    if (erros === 0) {
      console.log('\n✅ Todos os produtos foram vinculados ao estoque central com sucesso!');
    } else {
      console.log(`\n⚠️  Alguns erros ocorreram. Verifique os logs acima.`);
    }
  } catch (error: any) {
    console.error('❌ Erro durante a vinculação:', error.message);
    process.exit(1);
  }
}

// Executar o script
linkProductsToCentral()
  .then(() => {
    console.log('\n✨ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
