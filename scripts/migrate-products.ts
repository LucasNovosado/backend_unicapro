import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from '../src/config/supabase';

interface OldProduct {
  id: string;
  nome: string;
  imagem_url: string | null;
  categoria: string;
  quantidade_disponivel: number;
  created_at: string;
  image_1_url: string | null;
  image_2_url: string | null;
  image_3_url: string | null;
  imagem_capa_index: number;
}

async function migrateProducts() {
  try {
    // Ler o arquivo JSON (está no diretório raiz do projeto)
    const jsonPath = join(process.cwd(), '../referencia/banco.json');
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const products: OldProduct[] = JSON.parse(jsonContent);

    console.log(`Encontrados ${products.length} produtos para migrar`);

    // Preparar os dados para inserção
    const productsToInsert = products.map((prod) => ({
      id: prod.id,
      nome: prod.nome,
      categoria: prod.categoria,
      quantidade_disponivel: prod.quantidade_disponivel,
      imagem_url: prod.imagem_url,
      image_1_url: prod.image_1_url,
      image_2_url: prod.image_2_url,
      image_3_url: prod.image_3_url,
      imagem_capa_index: prod.imagem_capa_index,
      ativo: true, // Todos os produtos antigos são considerados ativos
      created_at: prod.created_at,
      updated_at: new Date().toISOString(),
    }));

    // Inserir em lotes de 100 para evitar problemas de tamanho
    const batchSize = 100;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < productsToInsert.length; i += batchSize) {
      const batch = productsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('estoque_produtos')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error(`Erro ao inserir lote ${Math.floor(i / batchSize) + 1}:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
        console.log(`Lote ${Math.floor(i / batchSize) + 1} inserido: ${batch.length} produtos`);
      }
    }

    console.log(`\nMigração concluída!`);
    console.log(`- Produtos inseridos/atualizados: ${inserted}`);
    console.log(`- Erros: ${errors}`);
  } catch (error: any) {
    console.error('Erro durante a migração:', error.message);
    process.exit(1);
  }
}

// Executar a migração
migrateProducts()
  .then(() => {
    console.log('Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
