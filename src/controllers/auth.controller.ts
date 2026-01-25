import { Request, Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import { supabase, supabasePublic, getSupabaseClient } from '../config/supabase';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Usar cliente público para fazer login (anon key)
    const { data: { user, session }, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !user || !session) {
      return res.status(401).json({ error: error?.message || 'Email ou senha inválidos' });
    }

    // Verificar se usuário existe em users_regras
    const { data: userRegra } = await supabase
      .from('users_regras')
      .select('id, nome, nivel')
      .eq('user_ref', user.id)
      .single();

    if (!userRegra) {
      return res.status(403).json({ error: 'Usuário não encontrado no sistema' });
    }

    res.json({
      token: session.access_token,
      refresh_token: session.refresh_token,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      },
      perfil: {
        id: userRegra.id,
        nome: userRegra.nome,
        nivel: userRegra.nivel
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
};

export const logout = async (req: RequestWithUser, res: Response) => {
  try {
    if (req.user) {
      const token = req.headers.authorization?.substring(7);
      if (token) {
        const client = getSupabaseClient(token);
        await client.auth.signOut();
      }
    }
    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
};

export const getMe = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.user || !req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar lojas vinculadas
    let lojasVinculadas: any[] = [];
    if (req.userRegra.nivel === 'supervisor') {
      const { data: lojas } = await supabase
        .from('users_regras_lojas')
        .select(`
          loja:lojas(*)
        `)
        .eq('user_regra_id', req.userRegra.id);

      lojasVinculadas = lojas?.map((l: any) => l.loja) || [];
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        user_metadata: req.user.user_metadata
      },
      perfil: {
        id: req.userRegra.id,
        nivel: req.userRegra.nivel,
        lojas_vinculadas: lojasVinculadas
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getLojas = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('lojas')
      .select('*')
      .order('nome');

    // Supervisor só vê suas lojas
    if (req.userRegra?.nivel === 'supervisor' && req.userRegra.lojas_vinculadas) {
      query = query.in('id', req.userRegra.lojas_vinculadas);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getEstoquesLocais = async (req: RequestWithUser, res: Response) => {
  try {
    let query = supabase
      .from('estoque_locais')
      .select(`
        *,
        loja:lojas(*)
      `)
      .order('nome');

    const userNivel = req.userRegra?.nivel;
    
    // Apenas diretor e supervisor podem ver o estoque central
    // Diretor vê todos os estoques (central + todas as lojas)
    // Supervisor vê estoque central + estoques de suas lojas
    if (userNivel === 'supervisor' && req.userRegra?.lojas_vinculadas) {
      query = query.or(`tipo.eq.central,loja_id.in.(${req.userRegra.lojas_vinculadas.join(',')})`);
    } else if (userNivel !== 'diretor' && userNivel !== 'supervisor') {
      // Outros níveis não veem o estoque central
      query = query.neq('tipo', 'central');
    }
    // Se for diretor, não aplica filtro (vê tudo)

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
