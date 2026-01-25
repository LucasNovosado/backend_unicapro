import { RequestWithUser, Response } from 'express';
import { supabase } from '../config/supabase';

export const getSaldos = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_saldos')
      .select(`
        *,
        produto:estoque_produtos(
          *,
          categoria:estoque_categorias(*)
        ),
        estoque_local:estoque_locais(*)
      `);

    const { estoque_local_id, categoria, search } = req.query;

    if (estoque_local_id) {
      query = query.eq('estoque_local_id', estoque_local_id as string);
    }

    if (categoria || search) {
      // Filtrar por categoria ou busca no nome do produto
      const produtoQuery = supabase
        .from('estoque_produtos')
        .select('id');

      if (categoria) {
        // Buscar categoria pelo nome e filtrar por categoria_id
        const { data: categoriaData } = await supabase
          .from('estoque_categorias')
          .select('id')
          .eq('nome', categoria as string)
          .single();
        
        if (categoriaData) {
          produtoQuery.eq('categoria_id', categoriaData.id);
        } else {
          return res.json([]);
        }
      }

      if (search) {
        produtoQuery.or(`nome.ilike.%${search}%,sku.ilike.%${search}%`);
      }

      const { data: produtos } = await produtoQuery;
      const produtoIds = produtos?.map(p => p.id) || [];

      if (produtoIds.length > 0) {
        query = query.in('produto_id', produtoIds);
      } else {
        return res.json([]);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getMovimentos = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_movimentos')
      .select(`
        *,
        produto:estoque_produtos(*),
        origem:estoque_locais!estoque_movimentos_estoque_local_origem_id_fkey(*),
        destino:estoque_locais!estoque_movimentos_estoque_local_destino_id_fkey(*)
      `)
      .order('created_at', { ascending: false });

    const { produto_id, estoque_local_id, referencia_id } = req.query;

    if (produto_id) {
      query = query.eq('produto_id', produto_id as string);
    }

    if (estoque_local_id) {
      query = query.or(`estoque_local_origem_id.eq.${estoque_local_id},estoque_local_destino_id.eq.${estoque_local_id}`);
    }

    if (referencia_id) {
      query = query.eq('referencia_id', referencia_id as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Buscar informações dos usuários separadamente
    if (data && data.length > 0) {
      const userIds = new Set<string>();
      data.forEach((movimento: any) => {
        if (movimento.created_by) userIds.add(movimento.created_by);
      });

      const usersMap = new Map<string, { id: string; email: string; nome: string }>();
      if (userIds.size > 0) {
        // Buscar nomes dos usuários da tabela users_regras
        const { data: usersRegras } = await supabase
          .from('users_regras')
          .select('user_ref, nome, email')
          .in('user_ref', Array.from(userIds));
        
        if (usersRegras) {
          usersRegras.forEach((userRegra: any) => {
            if (userIds.has(userRegra.user_ref)) {
              usersMap.set(userRegra.user_ref, { 
                id: userRegra.user_ref, 
                email: userRegra.email || '', 
                nome: userRegra.nome || ''
              });
            }
          });
        }
        
        // Buscar emails dos usuários do auth para completar dados
        const { data: users } = await supabase.auth.admin.listUsers();
        if (users?.users) {
          users.users.forEach((user: any) => {
            if (userIds.has(user.id)) {
              const existing = usersMap.get(user.id);
              if (existing) {
                // Atualizar email se não tiver na users_regras
                if (!existing.email) {
                  existing.email = user.email || '';
                }
              } else {
                // Se não encontrou na users_regras, criar entrada apenas com email
                usersMap.set(user.id, { 
                  id: user.id, 
                  email: user.email || '', 
                  nome: user.email || ''
                });
              }
            }
          });
        }
      }

      // Enriquecer dados com informações dos usuários
      const enrichedData = data.map((movimento: any) => ({
        ...movimento,
        created_by_user: movimento.created_by ? usersMap.get(movimento.created_by) || null : null,
      }));

      return res.json(enrichedData);
    }

    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const entradaEstoque = async (req: RequestWithUser, res: Response) => {
  try {
    const { produto_id, quantidade, estoque_local_destino_id, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data, error } = await supabase
      .from('estoque_movimentos')
      .insert({
        produto_id,
        quantidade,
        estoque_local_destino_id,
        estoque_local_origem_id: null,
        tipo: 'entrada',
        observacao,
        created_by: req.user.id
      })
      .select(`
        *,
        produto:estoque_produtos(*),
        destino:estoque_locais!estoque_movimentos_estoque_local_destino_id_fkey(*)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const saidaEstoque = async (req: RequestWithUser, res: Response) => {
  try {
    const { produto_id, quantidade, estoque_local_origem_id, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data, error } = await supabase
      .from('estoque_movimentos')
      .insert({
        produto_id,
        quantidade,
        estoque_local_origem_id,
        estoque_local_destino_id: null,
        tipo: 'saida',
        observacao,
        created_by: req.user.id
      })
      .select(`
        *,
        produto:estoque_produtos(*),
        origem:estoque_locais!estoque_movimentos_estoque_local_origem_id_fkey(*)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const transferenciaEstoque = async (req: RequestWithUser, res: Response) => {
  try {
    const { produto_id, quantidade, origem_id, destino_id, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data, error } = await supabase
      .from('estoque_movimentos')
      .insert({
        produto_id,
        quantidade,
        estoque_local_origem_id: origem_id,
        estoque_local_destino_id: destino_id,
        tipo: 'transferencia',
        observacao,
        created_by: req.user.id
      })
      .select(`
        *,
        produto:estoque_produtos(*),
        origem:estoque_locais!estoque_movimentos_estoque_local_origem_id_fkey(*),
        destino:estoque_locais!estoque_movimentos_estoque_local_destino_id_fkey(*)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const ajusteEstoque = async (req: RequestWithUser, res: Response) => {
  try {
    const { produto_id, quantidade_nova, estoque_local_id, motivo } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar saldo atual
    const { data: saldoAtual } = await supabase
      .from('estoque_saldos')
      .select('quantidade')
      .eq('produto_id', produto_id)
      .eq('estoque_local_id', estoque_local_id)
      .single();

    const quantidadeAtual = saldoAtual?.quantidade || 0;
    const diferenca = quantidade_nova - quantidadeAtual;

    if (diferenca === 0) {
      return res.status(400).json({ error: 'Nenhuma alteração necessária' });
    }

    // Criar movimentação de ajuste
    let movimentoData: any = {
      produto_id,
      tipo: 'ajuste',
      quantidade: Math.abs(diferenca),
      observacao: `Ajuste: ${motivo}. Quantidade anterior: ${quantidadeAtual}, Nova: ${quantidade_nova}`,
      created_by: req.user.id
    };

    if (diferenca > 0) {
      // Entrada
      movimentoData.estoque_local_destino_id = estoque_local_id;
      movimentoData.estoque_local_origem_id = null;
    } else {
      // Saída (verificar saldo primeiro)
      if (quantidadeAtual + diferenca < 0) {
        return res.status(400).json({ 
          error: `Saldo insuficiente. Saldo atual: ${quantidadeAtual}, Tentativa: ${quantidade_nova}` 
        });
      }
      movimentoData.estoque_local_origem_id = estoque_local_id;
      movimentoData.estoque_local_destino_id = null;
    }

    const { data, error } = await supabase
      .from('estoque_movimentos')
      .insert(movimentoData)
      .select(`
        *,
        produto:estoque_produtos(*),
        destino:estoque_locais!estoque_movimentos_estoque_local_destino_id_fkey(*),
        origem:estoque_locais!estoque_movimentos_estoque_local_origem_id_fkey(*)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
