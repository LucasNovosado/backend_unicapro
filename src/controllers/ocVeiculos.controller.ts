import { Response } from 'express';
import { RequestWithUser } from '../middleware/auth';
import * as ocService from '../services/ocVeiculos.service';

export const getOcs = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { loja_id, status, data_inicio, data_fim } = req.query;
    const data = await ocService.listOcs(req.userRegra, {
      loja_id: loja_id as string,
      status: status as string,
      data_inicio: data_inicio as string,
      data_fim: data_fim as string,
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao listar OCs' });
  }
};

export const getOcById = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { id } = req.params;
    const data = await ocService.getOcById(req.userRegra, id);
    res.json(data);
  } catch (e: any) {
    if (e.message === 'OC não encontrada' || e.message === 'Acesso negado') {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao buscar OC' });
  }
};

export const createOc = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra || !req.user?.id) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const createdBy = req.userRegra.id;
    const body = req.body;
    const data = await ocService.createOc(req.userRegra, createdBy, {
      loja_id: body.loja_id,
      veiculo_id: body.veiculo_id,
      motorista_id: body.motorista_id,
      vendedor_id: body.vendedor_id,
    });
    res.status(201).json(data);
  } catch (e: any) {
    if (e.message?.includes('obrigatório') || e.message?.includes('não pertence') || e.message?.includes('não disponível')) {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === 'Acesso negado') {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar OC' });
  }
};

export const fecharOc = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { id } = req.params;
    const { km_retorno } = req.body;
    const data = await ocService.fecharOc(req.userRegra, id, { km_retorno });
    res.json(data);
  } catch (e: any) {
    if (e.message === 'OC não encontrada' || e.message === 'Acesso negado') {
      return res.status(404).json({ error: e.message });
    }
    if (e.message?.includes('obrigatório') || e.message?.includes('já está') || e.message?.includes('km_retorno')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao fechar OC' });
  }
};

export const getLancamentos = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { id } = req.params;
    const data = await ocService.listLancamentos(req.userRegra, id);
    res.json(data);
  } catch (e: any) {
    if (e.message === 'OC não encontrada' || e.message === 'Acesso negado') {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao listar lançamentos' });
  }
};

export const createLancamento = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { id } = req.params;
    const body = req.body;
    const data = await ocService.createLancamento(req.userRegra, id, {
      categoria: body.categoria,
      descricao: body.descricao,
      valor: body.valor,
    });
    res.status(201).json(data);
  } catch (e: any) {
    if (e.message === 'OC não encontrada' || e.message === 'Acesso negado') {
      return res.status(404).json({ error: e.message });
    }
    if (e.message?.includes('inválid')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar lançamento' });
  }
};

export const getDashboardOc = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { loja_id, data_inicio, data_fim } = req.query;
    const data = await ocService.getDashboardOc(req.userRegra, {
      loja_id: loja_id as string,
      data_inicio: data_inicio as string,
      data_fim: data_fim as string,
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao buscar dashboard' });
  }
};

export const getVeiculosByLoja = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const lojaId = req.query.loja_id as string;
    if (!lojaId) {
      return res.status(400).json({ error: 'loja_id é obrigatório' });
    }
    const data = await ocService.getVeiculosByLoja(req.userRegra, lojaId);
    res.json(data);
  } catch (e: any) {
    if (e.message === 'Acesso negado à loja') {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao listar veículos' });
  }
};

export const getMotoristasByLoja = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const lojaId = req.query.loja_id as string;
    if (!lojaId) {
      return res.status(400).json({ error: 'loja_id é obrigatório' });
    }
    const data = await ocService.getMotoristasByLoja(req.userRegra, lojaId);
    res.json(data);
  } catch (e: any) {
    if (e.message === 'Acesso negado à loja') {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao listar motoristas' });
  }
};

export const registrarSaida = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const { id } = req.params;
    const { km_saida } = req.body;
    const data = await ocService.updateOcSaida(req.userRegra, id, Number(km_saida));
    res.json(data);
  } catch (e: any) {
    if (e.message === 'OC não encontrada' || e.message === 'Acesso negado') {
      return res.status(404).json({ error: e.message });
    }
    if (e.message?.includes('ABERTA')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao registrar saída' });
  }
};

export const listVeiculos = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const lojaId = req.query.loja_id as string | undefined;
    const data = await ocService.listVeiculos(req.userRegra, lojaId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao listar veículos' });
  }
};

export const createVeiculo = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const body = req.body;
    const data = await ocService.createVeiculo(req.userRegra, {
      placa: body.placa,
      modelo: body.modelo,
      apelido: body.apelido,
      loja_id: body.loja_id,
    });
    res.status(201).json(data);
  } catch (e: any) {
    if (e.message === 'Acesso negado à loja') {
      return res.status(403).json({ error: e.message });
    }
    if (e.message?.includes('obrigat')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar veículo' });
  }
};

export const listMotoristas = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const lojaId = req.query.loja_id as string | undefined;
    const data = await ocService.listMotoristas(req.userRegra, lojaId);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao listar motoristas' });
  }
};

export const getUsuariosMotoristas = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const data = await ocService.listUsuariosMotoristas(req.userRegra);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao listar usuários motoristas' });
  }
};

export const createMotorista = async (req: RequestWithUser, res: Response) => {
  try {
    if (!req.userRegra) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    const body = req.body;
    const data = await ocService.createMotorista(req.userRegra, {
      nome: body.nome,
      loja_id: body.loja_id,
      vendedor_id: body.vendedor_id,
      user_regra_id: body.user_regra_id,
    });
    res.status(201).json(data);
  } catch (e: any) {
    if (e.message === 'Acesso negado à loja') {
      return res.status(403).json({ error: e.message });
    }
    if (e.message?.includes('obrigat') || e.message?.includes('apenas um') || e.message?.includes('não encontrado') || e.message?.includes('nivel')) {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar motorista' });
  }
};
