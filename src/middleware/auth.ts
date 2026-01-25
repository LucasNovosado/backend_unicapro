import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../config/supabase';
import { supabase } from '../config/supabase';

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: any;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
  userRegra?: {
    id: string;
    nivel: 'diretor' | 'supervisor';
    lojas_vinculadas?: string[];
  };
}

// Middleware de autenticação
export const authenticate = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.substring(7);
    const client = getSupabaseClient(token);
    
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Erro na autenticação' });
  }
};

// Middleware para obter dados do usuário (users_regras)
export const getUserRegra = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Buscar dados do usuário em users_regras
    const { data: userRegra, error } = await supabase
      .from('users_regras')
      .select('id, nome, email, nivel, loja_id')
      .eq('user_ref', req.user.id)
      .single();

    if (error || !userRegra) {
      return res.status(403).json({ error: 'Usuário não encontrado no sistema' });
    }

    // Buscar lojas vinculadas se for supervisor
    let lojasVinculadas: string[] = [];
    if (userRegra.nivel === 'supervisor') {
      const { data: lojas } = await supabase
        .from('users_regras_lojas')
        .select('loja_id')
        .eq('user_regra_id', userRegra.id);

      lojasVinculadas = lojas?.map(l => l.loja_id) || [];
    }

    req.userRegra = {
      id: userRegra.id,
      nivel: userRegra.nivel as 'diretor' | 'supervisor',
      lojas_vinculadas: lojasVinculadas
    };

    next();
  } catch (error) {
    console.error('Get user regra error:', error);
    return res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
};

// Middleware para verificar se é admin/diretor
export const requireAdmin = (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  if (!req.userRegra || req.userRegra.nivel !== 'diretor') {
    return res.status(403).json({ error: 'Acesso negado. Apenas diretores.' });
  }
  next();
};

// Middleware para verificar acesso à loja (supervisor só vê suas lojas)
export const checkLojaAccess = (
  req: RequestWithUser,
  res: Response,
  next: NextFunction
) => {
  if (!req.userRegra) {
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  // Diretor tem acesso a tudo
  if (req.userRegra.nivel === 'diretor') {
    return next();
  }

  // Supervisor precisa ter acesso à loja
  const lojaId = req.params.loja_id || req.body.loja_id || req.query.loja_id;
  
  if (lojaId && req.userRegra.lojas_vinculadas) {
    if (!req.userRegra.lojas_vinculadas.includes(lojaId)) {
      return res.status(403).json({ error: 'Acesso negado a esta loja' });
    }
  }

  next();
};
