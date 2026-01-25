import { RequestWithUser, Response } from 'express';
import { supabase } from '../config/supabase';

export const getCategorias = async (req: RequestWithUser, res: Response) => {
  try {
    const { search, ativo } = req.query;
    
    let query = supabase
      .from('estoque_categorias')
      .select('*')
      .order('nome', { ascending: true });

    if (search) {
      query = query.ilike('nome', `%${search}%`);
    }

    if (ativo !== undefined) {
      query = query.eq('ativo', ativo === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getCategoriaById = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('estoque_categorias')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCategoria = async (req: RequestWithUser, res: Response) => {
  try {
    const { nome, descricao, ativo = true } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    // Verificar se já existe categoria com mesmo nome
    const { data: existing } = await supabase
      .from('estoque_categorias')
      .select('id')
      .ilike('nome', nome)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
    }

    const { data, error } = await supabase
      .from('estoque_categorias')
      .insert({
        nome,
        descricao,
        ativo
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateCategoria = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, descricao, ativo } = req.body;

    // Verificar se categoria existe
    const { data: existing } = await supabase
      .from('estoque_categorias')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    // Se mudou o nome, verificar se não existe outra com mesmo nome
    if (nome && nome !== existing.nome) {
      const { data: duplicate } = await supabase
        .from('estoque_categorias')
        .select('id')
        .ilike('nome', nome)
        .neq('id', id)
        .single();

      if (duplicate) {
        return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
      }
    }

    const updateData: any = {};
    if (nome !== undefined) updateData.nome = nome;
    if (descricao !== undefined) updateData.descricao = descricao;
    if (ativo !== undefined) updateData.ativo = ativo;

    const { data, error } = await supabase
      .from('estoque_categorias')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteCategoria = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se categoria existe
    const { data: existing } = await supabase
      .from('estoque_categorias')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    // Verificar se há produtos usando esta categoria
    const { data: produtos } = await supabase
      .from('estoque_produtos')
      .select('id')
      .eq('categoria_id', id)
      .limit(1);

    if (produtos && produtos.length > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir categoria que possui produtos vinculados' 
      });
    }

    const { error } = await supabase
      .from('estoque_categorias')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
