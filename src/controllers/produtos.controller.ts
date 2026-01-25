import { Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import { supabase } from '../config/supabase';

export const getProdutos = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_produtos')
      .select(`
        *,
        categoria:estoque_categorias(*)
      `)
      .order('created_at', { ascending: false });

    const { search, categoria_id, categoria, ativo, comEstoqueLocalId } = req.query;

    if (search) {
      query = query.or(`nome.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    // Suporte para categoria_id (novo) e categoria (antigo - compatibilidade)
    if (categoria_id) {
      query = query.eq('categoria_id', categoria_id as string);
    } else if (categoria) {
      // Buscar categoria pelo nome e filtrar por categoria_id
      const { data: categoriaData } = await supabase
        .from('estoque_categorias')
        .select('id')
        .eq('nome', categoria as string)
        .single();
      
      if (categoriaData) {
        query = query.eq('categoria_id', categoriaData.id);
      } else {
        // Se não encontrar categoria, retornar vazio
        return res.json([]);
      }
    }

    if (ativo !== undefined) {
      query = query.eq('ativo', ativo === 'true');
    }

    // Se pedir com estoque local, fazer join com estoque_saldos
    if (comEstoqueLocalId) {
      const { data, error } = await supabase
        .from('estoque_produtos')
        .select(`
          *,
          categoria:estoque_categorias(*),
          estoque_saldos!inner(
            quantidade,
            estoque_local_id
          )
        `)
        .eq('estoque_saldos.estoque_local_id', comEstoqueLocalId as string);

      if (error) throw error;
      return res.json(data);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProdutoById = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('estoque_produtos')
      .select(`
        *,
        categoria:estoque_categorias(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const createProduto = async (req: RequestWithUser, res: Response) => {
  try {
    const produtoData = { ...req.body };
    
    // Se enviou categoria_id, buscar o nome da categoria para preencher campo categoria (compatibilidade)
    // Se enviou categoria (nome), buscar o ID
    if (produtoData.categoria_id && !produtoData.categoria) {
      const { data: categoriaData } = await supabase
        .from('estoque_categorias')
        .select('nome')
        .eq('id', produtoData.categoria_id)
        .single();
      
      if (categoriaData) {
        produtoData.categoria = categoriaData.nome;
      } else {
        return res.status(400).json({ error: 'Categoria não encontrada' });
      }
    } else if (produtoData.categoria && !produtoData.categoria_id) {
      const { data: categoriaData } = await supabase
        .from('estoque_categorias')
        .select('id')
        .eq('nome', produtoData.categoria)
        .single();
      
      if (categoriaData) {
        produtoData.categoria_id = categoriaData.id;
      } else {
        return res.status(400).json({ error: 'Categoria não encontrada' });
      }
    }

    const { data, error } = await supabase
      .from('estoque_produtos')
      .insert(produtoData)
      .select(`
        *,
        categoria:estoque_categorias(*)
      `)
      .single();

    if (error) throw error;

    // Vincular produto ao estoque central automaticamente
    const { data: estoqueCentral } = await supabase
      .from('estoque_locais')
      .select('id')
      .eq('tipo', 'central')
      .single();

    if (estoqueCentral) {
      await supabase
        .from('estoque_saldos')
        .insert({
          produto_id: data.id,
          estoque_local_id: estoqueCentral.id,
          quantidade: data.quantidade_disponivel || 0
        });
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateProduto = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Se enviou categoria (nome), buscar o ID
    if (updateData.categoria && !updateData.categoria_id) {
      const { data: categoriaData } = await supabase
        .from('estoque_categorias')
        .select('id')
        .eq('nome', updateData.categoria)
        .single();
      
      if (categoriaData) {
        updateData.categoria_id = categoriaData.id;
      } else {
        return res.status(400).json({ error: 'Categoria não encontrada' });
      }
      delete updateData.categoria; // Remover campo antigo
    }

    const { data, error } = await supabase
      .from('estoque_produtos')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        categoria:estoque_categorias(*)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteProduto = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('estoque_produtos')
      .update({ ativo: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
