import { Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import { supabase } from '../config/supabase';

const STATUS_FLOW: Record<string, string[]> = {
  solicitacao: ['cotacao', 'cancelado'],
  cotacao: ['aguardando_oc', 'cancelado'],
  aguardando_oc: ['em_producao', 'cancelado'],
  em_producao: ['pronto_para_retirar', 'cancelado'],
  pronto_para_retirar: ['enviado_para_loja', 'cancelado'],
  enviado_para_loja: ['aplicado', 'cancelado'],
  aplicado: [],
  cancelado: []
};

const canChangeStatus = (statusAtual: string, statusNovo: string): boolean => {
  const allowedStatuses = STATUS_FLOW[statusAtual] || [];
  return allowedStatuses.includes(statusNovo);
};

export const getSolicitacoes = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_solicitacoes')
      .select(`
        *,
        loja:lojas(*),
        itens:estoque_solicitacao_itens(
          *,
          produto:estoque_produtos(*)
        )
      `)
      .order('created_at', { ascending: false });

    const { status, loja_id, search, periodo_inicio, periodo_fim, ativo } = req.query;

    // Supervisor só vê suas lojas
    if (req.userRegra?.nivel === 'supervisor' && req.userRegra.lojas_vinculadas) {
      query = query.in('loja_id', req.userRegra.lojas_vinculadas);
    }

    // Filtrar por ativo (se não especificado, mostrar apenas ativas)
    if (ativo !== undefined) {
      // Se ativo foi passado explicitamente, usar o valor
      if (ativo === 'all' || ativo === 'false') {
        // Se for 'all', não filtrar (mostrar todas)
        // Se for 'false', mostrar apenas desativadas
        if (ativo === 'all') {
          // Não aplicar filtro
        } else {
          query = query.eq('ativo', false);
        }
      } else {
        query = query.eq('ativo', ativo === 'true');
      }
    } else {
      // Por padrão, mostrar apenas solicitações ativas
      query = query.eq('ativo', true);
    }

    if (status) {
      query = query.eq('status', status as string);
    }

    if (loja_id) {
      query = query.eq('loja_id', loja_id as string);
    }

    if (periodo_inicio) {
      query = query.gte('created_at', periodo_inicio as string);
    }

    if (periodo_fim) {
      query = query.lte('created_at', periodo_fim as string);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Buscar informações dos usuários separadamente se necessário
    if (data && data.length > 0) {
      const userIds = new Set<string>();
      data.forEach((s: any) => {
        if (s.supervisor_id) userIds.add(s.supervisor_id);
        if (s.criado_por) userIds.add(s.criado_por);
      });

      // Buscar usuários da tabela users_regras e auth
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

      // Adicionar informações dos usuários aos dados
      const enrichedData = data.map((s: any) => ({
        ...s,
        supervisor: s.supervisor_id ? usersMap.get(s.supervisor_id) || null : null,
        criado_por_user: s.criado_por ? usersMap.get(s.criado_por) || null : null,
      }));

      // Filtrar por busca no objetivo ou nome da loja
      if (search) {
        const searchLower = (search as string).toLowerCase();
        const filtered = enrichedData.filter((s: any) => 
          s.objetivo?.toLowerCase().includes(searchLower) ||
          s.loja?.nome?.toLowerCase().includes(searchLower)
        );
        return res.json(filtered);
      }

      return res.json(enrichedData);
    }

    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSolicitacaoById = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('estoque_solicitacoes')
      .select(`
        *,
        loja:lojas(*),
        itens:estoque_solicitacao_itens(
          *,
          produto:estoque_produtos(*)
        ),
        logs:estoque_solicitacao_status_logs(*),
        comprovantes:estoque_solicitacao_comprovantes(*)
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

    // Buscar informações dos usuários
    const userIds = new Set<string>();
    if (data.supervisor_id) userIds.add(data.supervisor_id);
    if (data.criado_por) userIds.add(data.criado_por);
    if (data.logs) {
      data.logs.forEach((log: any) => {
        if (log.alterado_por) userIds.add(log.alterado_por);
      });
    }
    if (data.comprovantes) {
      data.comprovantes.forEach((comp: any) => {
        if (comp.created_by) userIds.add(comp.created_by);
      });
    }

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
    // Garantir que referencias seja um array (JSONB pode vir como objeto ou null)
    let referenciasArray: string[] = [];
    if (data.referencias) {
      if (Array.isArray(data.referencias)) {
        referenciasArray = data.referencias;
      } else if (typeof data.referencias === 'object') {
        // Se vier como objeto, converter para array
        referenciasArray = Object.values(data.referencias).filter((v): v is string => typeof v === 'string');
      } else if (typeof data.referencias === 'string') {
        // Se vier como string JSON, fazer parse
        try {
          const parsed = JSON.parse(data.referencias);
          referenciasArray = Array.isArray(parsed) ? parsed : [];
        } catch {
          referenciasArray = [];
        }
      }
    }

    const enrichedData = {
      ...data,
      supervisor: data.supervisor_id ? usersMap.get(data.supervisor_id) || null : null,
      criado_por_user: data.criado_por ? usersMap.get(data.criado_por) || null : null,
      logs: data.logs?.map((log: any) => ({
        ...log,
        alterado_por_user: log.alterado_por ? usersMap.get(log.alterado_por) || null : null,
      })),
      comprovantes: data.comprovantes?.map((comp: any) => ({
        ...comp,
        created_by_user: comp.created_by ? usersMap.get(comp.created_by) || null : null,
      })),
      referencias: referenciasArray
    };

    res.json(enrichedData);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const createSolicitacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { itens, referencias, ...solicitacaoData } = req.body;

    if (!req.user || !req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Verificar acesso à loja
    if (req.userRegra.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(solicitacaoData.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado a esta loja' });
      }
    }

    // Adicionar referências (links WebM/WebP) ao campo referencias
    if (referencias && Array.isArray(referencias) && referencias.length > 0) {
      solicitacaoData.referencias = referencias;
    }

    // Criar solicitação
    const { data: solicitacao, error: solicitacaoError } = await supabase
      .from('estoque_solicitacoes')
      .insert({
        ...solicitacaoData,
        supervisor_id: req.user.id,
        criado_por: req.user.id,
        status: 'solicitacao'
      })
      .select()
      .single();

    if (solicitacaoError) throw solicitacaoError;

    // Criar itens
    const itensComSolicitacaoId = itens.map((item: any) => ({
      ...item,
      solicitacao_id: solicitacao.id
    }));

    const { data: itensCriados, error: itensError } = await supabase
      .from('estoque_solicitacao_itens')
      .insert(itensComSolicitacaoId)
      .select(`
        *,
        produto:estoque_produtos(*)
      `);

    if (itensError) throw itensError;

    // Criar log inicial
    await supabase
      .from('estoque_solicitacao_status_logs')
      .insert({
        solicitacao_id: solicitacao.id,
        status_anterior: null,
        status_novo: 'solicitacao',
        alterado_por: req.user.id
      });

    res.status(201).json({
      ...solicitacao,
      itens: itensCriados
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateSolicitacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Verificar acesso
    const { data: solicitacao } = await supabase
      .from('estoque_solicitacoes')
      .select('loja_id, status')
      .eq('id', id)
      .single();

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (req.userRegra?.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(solicitacao.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    // Se estiver desativando, permitir em qualquer status
    // Caso contrário, só permite editar se estiver em status inicial
    const isDesativando = updateData.ativo === false;
    if (!isDesativando && solicitacao.status !== 'solicitacao' && solicitacao.status !== 'cotacao') {
      return res.status(400).json({ error: 'Não é possível editar solicitação neste status' });
    }

    const { data, error } = await supabase
      .from('estoque_solicitacoes')
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

export const changeStatus = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { status_novo, motivo } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar solicitação atual
    const { data: solicitacao, error: solicitacaoError } = await supabase
      .from('estoque_solicitacoes')
      .select('status, loja_id')
      .eq('id', id)
      .single();

    if (solicitacaoError) throw solicitacaoError;

    // Verificar acesso
    if (req.userRegra?.nivel === 'supervisor') {
      if (!req.userRegra.lojas_vinculadas?.includes(solicitacao.loja_id)) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    // Validar transição de status
    if (!canChangeStatus(solicitacao.status, status_novo)) {
      return res.status(400).json({ 
        error: `Não é possível mudar de ${solicitacao.status} para ${status_novo}` 
      });
    }

    // Atualizar status
    const { data: updated, error: updateError } = await supabase
      .from('estoque_solicitacoes')
      .update({ status: status_novo })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // O trigger cria o log automaticamente, então buscamos o log mais recente e atualizamos com o motivo
    if (motivo) {
      const { data: log } = await supabase
        .from('estoque_solicitacao_status_logs')
        .select('id')
        .eq('solicitacao_id', id)
        .eq('status_anterior', solicitacao.status)
        .eq('status_novo', status_novo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (log) {
        await supabase
          .from('estoque_solicitacao_status_logs')
          .update({ motivo })
          .eq('id', log.id);
      }
    }

    // ============================================
    // INTEGRAÇÃO AUTOMÁTICA COM ESTOQUE
    // ============================================

    // 1. Status "pronto_para_retirar": Criar produtos no estoque Central
    if (status_novo === 'pronto_para_retirar') {
      try {
        console.log(`🔄 Processando integração com estoque para solicitação ${id} - Status: pronto_para_retirar`);
        
        // Buscar estoque central
        const { data: estoqueCentral, error: estoqueCentralError } = await supabase
          .from('estoque_locais')
          .select('id')
          .eq('tipo', 'central')
          .single();

        if (estoqueCentralError) {
          console.error('❌ Erro ao buscar estoque central:', estoqueCentralError);
          throw estoqueCentralError;
        }

        if (!estoqueCentral) {
          console.warn('⚠️ Estoque central não encontrado');
          throw new Error('Estoque central não encontrado');
        }

        console.log(`✅ Estoque central encontrado: ${estoqueCentral.id}`);

        // Buscar itens da solicitação
        // Se não tiver quantidade_aprovada, usar quantidade_solicitada (para casos onde OC foi aprovada automaticamente)
        const { data: itens, error: itensError } = await supabase
          .from('estoque_solicitacao_itens')
          .select('produto_id, quantidade_aprovada, quantidade_solicitada')
          .eq('solicitacao_id', id);

        if (itensError) {
          console.error('❌ Erro ao buscar itens da solicitação:', itensError);
          throw itensError;
        }

        if (!itens || itens.length === 0) {
          console.warn(`⚠️ Nenhum item encontrado para a solicitação ${id}`);
        } else {
          console.log(`📦 Encontrados ${itens.length} itens na solicitação`);
          
          for (const item of itens) {
            // Usar quantidade_aprovada se disponível, senão usar quantidade_solicitada
            const quantidade = item.quantidade_aprovada || item.quantidade_solicitada || 0;
            
            console.log(`  - Item: produto_id=${item.produto_id}, quantidade_aprovada=${item.quantidade_aprovada}, quantidade_solicitada=${item.quantidade_solicitada}, quantidade_final=${quantidade}`);
            
            if (quantidade > 0) {
              // Criar entrada no estoque Central
              const movimentoData = {
                produto_id: item.produto_id,
                quantidade: quantidade,
                estoque_local_origem_id: null,
                estoque_local_destino_id: estoqueCentral.id,
                tipo: 'entrada',
                referencia_tipo: 'solicitacao',
                referencia_id: id,
                observacao: `Entrada automática - Solicitação ${id} - Status: Pronto para Retirar`,
                created_by: req.user.id
              };

              console.log(`  📝 Criando movimentação:`, JSON.stringify(movimentoData, null, 2));

              const { data: movimentoCriado, error: movimentoError } = await supabase
                .from('estoque_movimentos')
                .insert(movimentoData)
                .select()
                .single();

              if (movimentoError) {
                console.error(`❌ Erro ao criar movimentação para produto ${item.produto_id}:`, movimentoError);
                console.error('Detalhes do erro:', JSON.stringify(movimentoError, null, 2));
                // Continuar com os outros itens mesmo se um falhar
              } else {
                console.log(`✅ Movimentação criada com sucesso: ${movimentoCriado?.id} para produto ${item.produto_id}, quantidade: ${quantidade}`);
              }
            } else {
              console.warn(`⚠️ Quantidade inválida (${quantidade}) para produto ${item.produto_id}, pulando...`);
            }
          }
        }
      } catch (error: any) {
        // Log do erro mas não interrompe o fluxo da mudança de status
        console.error('❌ Erro ao processar integração com estoque (pronto_para_retirar):', error);
        console.error('Stack trace:', error.stack);
      }
    }

    // 2. Status "enviado_para_loja": Transferir do estoque Central para o estoque da Loja
    if (status_novo === 'enviado_para_loja') {
      try {
        console.log(`🔄 Processando integração com estoque para solicitação ${id} - Status: enviado_para_loja`);
        console.log(`📍 Loja da solicitação: ${solicitacao.loja_id}`);
        
        // Buscar estoque central
        const { data: estoqueCentral, error: estoqueCentralError } = await supabase
          .from('estoque_locais')
          .select('id')
          .eq('tipo', 'central')
          .single();

        if (estoqueCentralError) {
          console.error('❌ Erro ao buscar estoque central:', estoqueCentralError);
          throw estoqueCentralError;
        }

        if (!estoqueCentral) {
          console.warn('⚠️ Estoque central não encontrado');
          throw new Error('Estoque central não encontrado');
        }

        console.log(`✅ Estoque central encontrado: ${estoqueCentral.id}`);

        // Buscar estoque da loja
        const { data: estoqueLoja, error: estoqueLojaError } = await supabase
          .from('estoque_locais')
          .select('id, nome, tipo, loja_id')
          .eq('loja_id', solicitacao.loja_id)
          .eq('tipo', 'loja')
          .single();

        if (estoqueLojaError) {
          console.error('❌ Erro ao buscar estoque da loja:', estoqueLojaError);
          console.error('Loja ID procurada:', solicitacao.loja_id);
          throw estoqueLojaError;
        }

        if (!estoqueLoja) {
          console.warn(`⚠️ Estoque da loja não encontrado para loja_id: ${solicitacao.loja_id}`);
          throw new Error(`Estoque da loja não encontrado para loja_id: ${solicitacao.loja_id}`);
        }

        console.log(`✅ Estoque da loja encontrado: ${estoqueLoja.id} (${estoqueLoja.nome})`);

        // Buscar itens da solicitação
        // Usar quantidade_aprovada se quantidade_enviada não estiver definida
        const { data: itens, error: itensError } = await supabase
          .from('estoque_solicitacao_itens')
          .select('produto_id, quantidade_aprovada, quantidade_enviada, quantidade_solicitada')
          .eq('solicitacao_id', id);

        if (itensError) {
          console.error('❌ Erro ao buscar itens da solicitação:', itensError);
          throw itensError;
        }

        if (!itens || itens.length === 0) {
          console.warn(`⚠️ Nenhum item encontrado para a solicitação ${id}`);
        } else {
          console.log(`📦 Encontrados ${itens.length} itens na solicitação`);
          
          for (const item of itens) {
            // Usar quantidade_enviada se disponível, senão usar quantidade_aprovada, senão usar quantidade_solicitada
            const quantidade = item.quantidade_enviada || item.quantidade_aprovada || item.quantidade_solicitada || 0;
            
            console.log(`  - Item: produto_id=${item.produto_id}, quantidade_enviada=${item.quantidade_enviada}, quantidade_aprovada=${item.quantidade_aprovada}, quantidade_solicitada=${item.quantidade_solicitada}, quantidade_final=${quantidade}`);
            
            if (quantidade > 0) {
              // Criar transferência do estoque Central para o estoque da Loja
              const movimentoData = {
                produto_id: item.produto_id,
                quantidade: quantidade,
                estoque_local_origem_id: estoqueCentral.id,
                estoque_local_destino_id: estoqueLoja.id,
                tipo: 'transferencia',
                referencia_tipo: 'solicitacao',
                referencia_id: id,
                observacao: `Transferência automática - Solicitação ${id} - Status: Enviado para Loja`,
                created_by: req.user.id
              };

              console.log(`  📝 Criando movimentação de transferência:`, JSON.stringify(movimentoData, null, 2));

              const { data: movimentoCriado, error: movimentoError } = await supabase
                .from('estoque_movimentos')
                .insert(movimentoData)
                .select()
                .single();

              if (movimentoError) {
                console.error(`❌ Erro ao criar movimentação de transferência para produto ${item.produto_id}:`, movimentoError);
                console.error('Detalhes do erro:', JSON.stringify(movimentoError, null, 2));
                // Continuar com os outros itens mesmo se um falhar
              } else {
                console.log(`✅ Transferência criada com sucesso: ${movimentoCriado?.id} para produto ${item.produto_id}, quantidade: ${quantidade}`);
                console.log(`   Origem: Central (${estoqueCentral.id}) → Destino: Loja (${estoqueLoja.id})`);
              }
            } else {
              console.warn(`⚠️ Quantidade inválida (${quantidade}) para produto ${item.produto_id}, pulando...`);
            }
          }
        }
      } catch (error: any) {
        // Log do erro mas não interrompe o fluxo da mudança de status
        console.error('❌ Erro ao processar integração com estoque (enviado_para_loja):', error);
        console.error('Stack trace:', error.stack);
      }
    }

    // 3. Status "aplicado": Dar baixa definitiva no estoque da Loja
    if (status_novo === 'aplicado') {
      try {
        console.log(`🔄 Processando integração com estoque para solicitação ${id} - Status: aplicado`);
        console.log(`📍 Loja da solicitação: ${solicitacao.loja_id}`);
        
        // Buscar estoque da loja
        const { data: estoqueLoja, error: estoqueLojaError } = await supabase
          .from('estoque_locais')
          .select('id, nome, tipo, loja_id')
          .eq('loja_id', solicitacao.loja_id)
          .eq('tipo', 'loja')
          .single();

        if (estoqueLojaError) {
          console.error('❌ Erro ao buscar estoque da loja:', estoqueLojaError);
          console.error('Loja ID procurada:', solicitacao.loja_id);
          throw estoqueLojaError;
        }

        if (!estoqueLoja) {
          console.warn(`⚠️ Estoque da loja não encontrado para loja_id: ${solicitacao.loja_id}`);
          throw new Error(`Estoque da loja não encontrado para loja_id: ${solicitacao.loja_id}`);
        }

        console.log(`✅ Estoque da loja encontrado: ${estoqueLoja.id} (${estoqueLoja.nome})`);

        // Buscar itens da solicitação
        const { data: itens, error: itensError } = await supabase
          .from('estoque_solicitacao_itens')
          .select('produto_id, quantidade_enviada, quantidade_aprovada, quantidade_solicitada')
          .eq('solicitacao_id', id);

        if (itensError) {
          console.error('❌ Erro ao buscar itens da solicitação:', itensError);
          throw itensError;
        }

        if (!itens || itens.length === 0) {
          console.warn(`⚠️ Nenhum item encontrado para a solicitação ${id}`);
        } else {
          console.log(`📦 Encontrados ${itens.length} itens na solicitação`);
          
          for (const item of itens) {
            // Usar quantidade_enviada se disponível, senão usar quantidade_aprovada, senão usar quantidade_solicitada
            const quantidade = item.quantidade_enviada || item.quantidade_aprovada || item.quantidade_solicitada || 0;
            
            console.log(`  - Item: produto_id=${item.produto_id}, quantidade_enviada=${item.quantidade_enviada}, quantidade_aprovada=${item.quantidade_aprovada}, quantidade_solicitada=${item.quantidade_solicitada}, quantidade_final=${quantidade}`);
            
            if (quantidade > 0) {
              // Criar saída do estoque da loja (baixa definitiva - remove do estoque)
              const movimentoData = {
                produto_id: item.produto_id,
                quantidade: quantidade,
                estoque_local_origem_id: estoqueLoja.id,
                estoque_local_destino_id: null,
                tipo: 'saida',
                referencia_tipo: 'solicitacao',
                referencia_id: id,
                observacao: `Baixa definitiva - Solicitação ${id} - Status: Instalado/Aplicado`,
                created_by: req.user.id
              };

              console.log(`  📝 Criando movimentação de saída (baixa definitiva):`, JSON.stringify(movimentoData, null, 2));

              const { data: movimentoCriado, error: movimentoError } = await supabase
                .from('estoque_movimentos')
                .insert(movimentoData)
                .select()
                .single();

              if (movimentoError) {
                console.error(`❌ Erro ao criar movimentação de saída para produto ${item.produto_id}:`, movimentoError);
                console.error('Detalhes do erro:', JSON.stringify(movimentoError, null, 2));
                // Continuar com os outros itens mesmo se um falhar
              } else {
                console.log(`✅ Baixa definitiva criada com sucesso: ${movimentoCriado?.id} para produto ${item.produto_id}, quantidade: ${quantidade}`);
                console.log(`   Produto removido do estoque da loja: ${estoqueLoja.nome}`);
              }
            } else {
              console.warn(`⚠️ Quantidade inválida (${quantidade}) para produto ${item.produto_id}, pulando...`);
            }
          }
        }
      } catch (error: any) {
        // Log do erro mas não interrompe o fluxo da mudança de status
        console.error('❌ Erro ao processar integração com estoque (aplicado):', error);
        console.error('Stack trace:', error.stack);
      }
    }

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const addItemSolicitacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar acesso e status
    const { data: solicitacao } = await supabase
      .from('estoque_solicitacoes')
      .select('status, loja_id')
      .eq('id', id)
      .single();

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (solicitacao.status !== 'solicitacao') {
      return res.status(400).json({ error: 'Não é possível adicionar itens neste status' });
    }

    const { data, error } = await supabase
      .from('estoque_solicitacao_itens')
      .insert({
        ...req.body,
        solicitacao_id: id
      })
      .select(`
        *,
        produto:estoque_produtos(*)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateItemSolicitacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { id, item_id } = req.params;

    const { data, error } = await supabase
      .from('estoque_solicitacao_itens')
      .update(req.body)
      .eq('id', item_id)
      .eq('solicitacao_id', id)
      .select(`
        *,
        produto:estoque_produtos(*)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteItemSolicitacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { id, item_id } = req.params;

    const { error } = await supabase
      .from('estoque_solicitacao_itens')
      .delete()
      .eq('id', item_id)
      .eq('solicitacao_id', id);

    if (error) throw error;
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const aprovarOC = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar solicitação
    const { data: solicitacao } = await supabase
      .from('estoque_solicitacoes')
      .select('status, loja_id')
      .eq('id', id)
      .single();

    if (!solicitacao || solicitacao.status !== 'aguardando_oc') {
      return res.status(400).json({ error: 'Solicitação não está aguardando OC' });
    }

    // Aprovar itens (quantidade_aprovada = quantidade_solicitada por padrão)
    const { data: itens } = await supabase
      .from('estoque_solicitacao_itens')
      .select('id, quantidade_solicitada')
      .eq('solicitacao_id', id);

    if (itens) {
      for (const item of itens) {
        await supabase
          .from('estoque_solicitacao_itens')
          .update({ quantidade_aprovada: item.quantidade_solicitada })
          .eq('id', item.id);
      }
    }

    // Mudar status para em_producao
    const { data, error } = await supabase
      .from('estoque_solicitacoes')
      .update({ status: 'em_producao' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // O trigger cria o log automaticamente, então buscamos o log mais recente e atualizamos com o motivo
    if (req.user) {
      const { data: log } = await supabase
        .from('estoque_solicitacao_status_logs')
        .select('id')
        .eq('solicitacao_id', id)
        .eq('status_anterior', 'aguardando_oc')
        .eq('status_novo', 'em_producao')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (log) {
        await supabase
          .from('estoque_solicitacao_status_logs')
          .update({ motivo: 'OC aprovada' })
          .eq('id', log.id);
      }
    }

    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const reprovarOC = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório' });
    }

    const { data, error } = await supabase
      .from('estoque_solicitacoes')
      .update({ status: 'cotacao' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // O trigger cria o log automaticamente, então buscamos o log mais recente e atualizamos com o motivo
    if (req.user) {
      const { data: log } = await supabase
        .from('estoque_solicitacao_status_logs')
        .select('id')
        .eq('solicitacao_id', id)
        .eq('status_anterior', 'aguardando_oc')
        .eq('status_novo', 'cotacao')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (log) {
        await supabase
          .from('estoque_solicitacao_status_logs')
          .update({ motivo })
          .eq('id', log.id);
      }
    }

    res.json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const confirmarRetirada = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { imagem_url, assinatura_url, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data: comprovante, error } = await supabase
      .from('estoque_solicitacao_comprovantes')
      .insert({
        solicitacao_id: id,
        tipo: 'retirada',
        imagem_url,
        assinatura_url,
        observacao,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(comprovante);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const confirmarEnvio = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { tracking_code, imagem_url, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data: comprovante, error } = await supabase
      .from('estoque_solicitacao_comprovantes')
      .insert({
        solicitacao_id: id,
        tipo: 'envio',
        tracking_code,
        imagem_url,
        observacao,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(comprovante);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const confirmarAplicacao = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;
    const { imagem_url, observacao } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { data: comprovante, error } = await supabase
      .from('estoque_solicitacao_comprovantes')
      .insert({
        solicitacao_id: id,
        tipo: 'aplicacao',
        imagem_url,
        observacao,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(comprovante);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getLogs = async (req: RequestWithUser, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('estoque_solicitacao_status_logs')
      .select('*')
      .eq('solicitacao_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Buscar informações dos usuários
    if (data && data.length > 0) {
      const userIds = new Set<string>();
      data.forEach((log: any) => {
        if (log.alterado_por) userIds.add(log.alterado_por);
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

      const enrichedData = data.map((log: any) => ({
        ...log,
        alterado_por_user: log.alterado_por ? usersMap.get(log.alterado_por) || null : null,
      }));

      return res.json(enrichedData);
    }

    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
