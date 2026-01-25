import { Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import { supabase } from '../config/supabase';

export const getAlertas = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_solicitacoes')
      .select(`
        id,
        status,
        prioridade,
        objetivo,
        created_at,
        loja:lojas(id, nome, cidade, estado),
        itens:estoque_solicitacao_itens(
          id,
          quantidade_solicitada,
          quantidade_aprovada,
          produto:estoque_produtos(id, nome, categoria)
        )
      `)
      .eq('status', 'pronto_para_retirar')
      .order('created_at', { ascending: false });

    // Supervisor só vê alertas de suas lojas
    if (req.userRegra?.nivel === 'supervisor' && req.userRegra.lojas_vinculadas) {
      query = query.in('loja_id', req.userRegra.lojas_vinculadas);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
