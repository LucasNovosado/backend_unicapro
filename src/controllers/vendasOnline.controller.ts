import { Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import { supabase } from '../config/supabase';

export const getVendas = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('vendas_online')
      .select(`
        *,
        loja:lojas(id, nome, cidade, estado),
        itens:vendas_online_itens(*)
      `)
      .order('data_pedido', { ascending: false })
      .order('hora_pedido', { ascending: false });

    const { status, loja_id, tipo_venda, data_inicio, data_fim, search, usuario_id } = req.query;

    // Supervisor só vê suas lojas
    if (req.userRegra?.nivel === 'supervisor' && req.userRegra.lojas_vinculadas) {
      query = query.in('loja_id', req.userRegra.lojas_vinculadas);
    }

    if (status) {
      query = query.eq('status', status as string);
    }

    if (loja_id) {
      query = query.eq('loja_id', loja_id as string);
    }

    if (tipo_venda) {
      // Suportar filtro por tipos_venda (JSONB) ou tipo_venda (legado)
      query = query.or(`tipo_venda.eq.${tipo_venda},tipos_venda.cs.["${tipo_venda}"]`);
    }

    if (usuario_id) {
      query = query.eq('usuario_id', usuario_id as string);
    }

    if (data_inicio) {
      query = query.gte('data_pedido', data_inicio as string);
    }

    if (data_fim) {
      query = query.lte('data_pedido', data_fim as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Buscar informações dos usuários
    if (data && data.length > 0) {
      const userIds = new Set<string>();
      data.forEach((venda: any) => {
        if (venda.usuario_id) userIds.add(venda.usuario_id);
      });

      const usersMap = new Map<string, { id: string; email: string; nome: string }>();
      if (userIds.size > 0) {
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
        
        const { data: users } = await supabase.auth.admin.listUsers();
        if (users?.users) {
          users.users.forEach((user: any) => {
            if (userIds.has(user.id)) {
              const existing = usersMap.get(user.id);
              if (existing) {
                if (!existing.email) {
                  existing.email = user.email || '';
                }
              } else {
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

      const enrichedData = data.map((venda: any) => ({
        ...venda,
        usuario: venda.usuario_id ? usersMap.get(venda.usuario_id) || null : null,
      }));

      // Filtrar por busca se necessário (ignorando acentos)
      if (search) {
        const removeAccents = (str: string) => {
          return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        };
        
        const searchTerm = removeAccents((search as string).toLowerCase());
        const filtered = enrichedData.filter((venda: any) => {
          const marcaSemAcento = removeAccents((venda.marca_bateria?.toLowerCase() || ''));
          const lojaSemAcento = removeAccents((venda.loja?.nome?.toLowerCase() || ''));
          const obsSemAcento = removeAccents((venda.observacao?.toLowerCase() || ''));
          
          return marcaSemAcento.includes(searchTerm) ||
                 lojaSemAcento.includes(searchTerm) ||
                 obsSemAcento.includes(searchTerm);
        });
        return res.json(filtered);
      }

      return res.json(enrichedData);
    }

    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getVendaById = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('vendas_online')
      .select(`
        *,
        loja:lojas(id, nome, cidade, estado),
        itens:vendas_online_itens(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Verificar acesso
    if (req.userRegra?.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(data.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    // Buscar informações do usuário
    const usersMap = new Map<string, { id: string; email: string; nome: string }>();
    if (data.usuario_id) {
      const { data: usersRegras } = await supabase
        .from('users_regras')
        .select('user_ref, nome, email')
        .eq('user_ref', data.usuario_id);
      
      if (usersRegras && usersRegras.length > 0) {
        const userRegra = usersRegras[0];
        usersMap.set(userRegra.user_ref, { 
          id: userRegra.user_ref, 
          email: userRegra.email || '', 
          nome: userRegra.nome || ''
        });
      }
      
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users?.users) {
        const user = users.users.find((u: any) => u.id === data.usuario_id);
        if (user) {
          const existing = usersMap.get(user.id);
          if (existing) {
            if (!existing.email) {
              existing.email = user.email || '';
            }
          } else {
            usersMap.set(user.id, { 
              id: user.id, 
              email: user.email || '', 
              nome: user.email || ''
            });
          }
        }
      }
    }

    const enrichedData = {
      ...data,
      usuario: data.usuario_id ? usersMap.get(data.usuario_id) || null : null,
    };

    res.json(enrichedData);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const createVenda = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.user || !req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const vendaData = {
      ...req.body,
      usuario_id: req.user.id,
    };

    // Verificar acesso à loja
    if (req.userRegra.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(vendaData.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado a esta loja' });
      }
    }

    const { data, error } = await supabase
      .from('vendas_online')
      .insert(vendaData)
      .select(`
        *,
        loja:lojas(id, nome, cidade, estado)
      `)
      .single();

    if (error) throw error;

    // Buscar informações do usuário
    const usersMap = new Map<string, { id: string; email: string; nome: string }>();
    if (data.usuario_id) {
      const { data: usersRegras } = await supabase
        .from('users_regras')
        .select('user_ref, nome, email')
        .eq('user_ref', data.usuario_id);
      
      if (usersRegras && usersRegras.length > 0) {
        const userRegra = usersRegras[0];
        usersMap.set(userRegra.user_ref, { 
          id: userRegra.user_ref, 
          email: userRegra.email || '', 
          nome: userRegra.nome || ''
        });
      }
    }

    const enrichedData = {
      ...data,
      usuario: data.usuario_id ? usersMap.get(data.usuario_id) || null : null,
    };

    res.status(201).json(enrichedData);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateVenda = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Verificar acesso
    const { data: venda } = await supabase
      .from('vendas_online')
      .select('loja_id, usuario_id')
      .eq('id', id)
      .single();

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    // Verificar se o usuário pode editar (próprio registro ou supervisor/diretor)
    if (req.userRegra?.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(venda.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    } else if (req.userRegra?.nivel !== 'diretor') {
      // Vendedor só pode editar suas próprias vendas
      if (venda.usuario_id !== req.user?.id) {
        return res.status(403).json({ error: 'Você só pode editar suas próprias vendas' });
      }
    }

    const { data, error } = await supabase
      .from('vendas_online')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        loja:lojas(id, nome, cidade, estado)
      `)
      .single();

    if (error) throw error;

    // Buscar informações do usuário
    const usersMap = new Map<string, { id: string; email: string; nome: string }>();
    if (data.usuario_id) {
      const { data: usersRegras } = await supabase
        .from('users_regras')
        .select('user_ref, nome, email')
        .eq('user_ref', data.usuario_id);
      
      if (usersRegras && usersRegras.length > 0) {
        const userRegra = usersRegras[0];
        usersMap.set(userRegra.user_ref, { 
          id: userRegra.user_ref, 
          email: userRegra.email || '', 
          nome: userRegra.nome || ''
        });
      }
    }

    const enrichedData = {
      ...data,
      usuario: data.usuario_id ? usersMap.get(data.usuario_id) || null : null,
    };

    res.json(enrichedData);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteVenda = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar acesso
    const { data: venda } = await supabase
      .from('vendas_online')
      .select('loja_id, usuario_id')
      .eq('id', id)
      .single();

    if (!venda) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    // Verificar se o usuário pode deletar (próprio registro ou supervisor/diretor)
    if (req.userRegra?.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(venda.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    } else if (req.userRegra?.nivel !== 'diretor') {
      // Vendedor só pode deletar suas próprias vendas
      if (venda.usuario_id !== req.user?.id) {
        return res.status(403).json({ error: 'Você só pode deletar suas próprias vendas' });
      }
    }

    const { error } = await supabase
      .from('vendas_online')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Endpoint para obter resumo de vendas
export const getResumoVendas = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('vendas_online')
      .select('status, tipo_venda, valor, valor_final, data_pedido');

    const { loja_id, data_inicio, data_fim, tipo_venda } = req.query;

    // Supervisor só vê suas lojas
    if (req.userRegra?.nivel === 'supervisor' && req.userRegra.lojas_vinculadas) {
      query = query.in('loja_id', req.userRegra.lojas_vinculadas);
    }

    if (loja_id) {
      query = query.eq('loja_id', loja_id as string);
    }

    if (tipo_venda) {
      query = query.eq('tipo_venda', tipo_venda as string);
    }

    if (data_inicio) {
      query = query.gte('data_pedido', data_inicio as string);
    }

    if (data_fim) {
      query = query.lte('data_pedido', data_fim as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calcular resumo
    const resumo = {
      total_vendas: data?.length || 0,
      total_valor: data?.reduce((sum: number, venda: any) => {
        const valorNumerico =
          venda.valor_final != null
            ? parseFloat(venda.valor_final)
            : parseFloat(venda.valor);
        return sum + (valorNumerico || 0);
      }, 0) || 0,
      por_status: {
        ENTREGUE: data?.filter((v: any) => v.status === 'ENTREGUE').length || 0,
        RETIRADA: data?.filter((v: any) => v.status === 'RETIRADA').length || 0,
        'RETIR.PEND': data?.filter((v: any) => v.status === 'RETIR.PEND').length || 0,
        CANCELADA: data?.filter((v: any) => v.status === 'CANCELADA').length || 0,
      },
      por_tipo: {
        CRM: data?.filter((v: any) => v.tipo_venda === 'CRM').length || 0,
        Marketplace: data?.filter((v: any) => v.tipo_venda === 'Marketplace').length || 0,
      },
    };

    res.json(resumo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
