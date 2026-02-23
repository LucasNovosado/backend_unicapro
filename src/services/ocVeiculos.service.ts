/**
 * Serviço OC Veículos - Toda a regra de negócio do módulo
 */
import { supabase } from '../config/supabase';

const OC_STATUS = ['ABERTA', 'EM_ANDAMENTO', 'FECHADA', 'ATRASADA'] as const;
const LANCAMENTO_CATEGORIA = ['combustivel', 'pedagio', 'manutencao', 'outros'] as const;

export type OcStatus = typeof OC_STATUS[number];
export type LancamentoCategoria = typeof LANCAMENTO_CATEGORIA[number];

export interface UserRegraContext {
  id: string;
  nivel: string;
  loja_id?: string | null;
  lojas_vinculadas?: string[];
}

/** Retorna loja(s) que o usuário pode acessar */
function getLojasPermitidas(regra: UserRegraContext): string[] {
  if (!regra?.lojas_vinculadas?.length) return [];
  return regra.lojas_vinculadas;
}

/** Verifica se o usuário pode acessar a loja */
function podeAcessarLoja(regra: UserRegraContext, lojaId: string): boolean {
  const lojas = getLojasPermitidas(regra);
  return lojas.includes(lojaId);
}

/** Filtra query de OCs por permissão (loja, motorista, supervisor, diretor) */
function applyOcFilter(regra: UserRegraContext, query: any, lojaId?: string) {
  const lojas = getLojasPermitidas(regra);
  if (lojas.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000'); // nenhum resultado
  if (regra.nivel === 'motorista') {
    // Motorista: buscar motorista pelo user_regra_id e filtrar OCs onde motorista_id = esse id
    return query; // Filtro por motorista será aplicado após buscar motorista_id
  }
  return query.in('loja_id', lojas);
}

/** Lista OCs com permissão por perfil */
export async function listOcs(regra: UserRegraContext, filters: {
  loja_id?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
}) {
  let query = supabase
    .from('ocs')
    .select(`
      id, loja_id, veiculo_id, motorista_id, vendedor_id,
      km_saida, km_retorno, km_total, status, data_saida, data_retorno,
      created_by, created_at,
      loja:lojas(id, nome, cidade, estado),
      veiculo:veiculos(id, placa, modelo, apelido),
      motorista:motoristas(id, nome, vendedor_id, user_regra_id)
    `)
    .order('created_at', { ascending: false });

  query = applyOcFilter(regra, query);

  if (regra.nivel === 'motorista') {
    const { data: motorista } = await supabase
      .from('motoristas')
      .select('id')
      .eq('user_regra_id', regra.id)
      .single();
    if (motorista) {
      query = query.eq('motorista_id', motorista.id);
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  if (filters.loja_id && podeAcessarLoja(regra, filters.loja_id)) {
    query = query.eq('loja_id', filters.loja_id);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.data_inicio) {
    query = query.gte('data_saida', filters.data_inicio);
  }
  if (filters.data_fim) {
    query = query.lte('data_saida', filters.data_fim);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Busca OC por ID com verificação de acesso */
export async function getOcById(regra: UserRegraContext, ocId: string) {
  const { data: oc, error } = await supabase
    .from('ocs')
    .select(`
      *,
      loja:lojas(id, nome, cidade, estado),
      veiculo:veiculos(id, placa, modelo, apelido),
      motorista:motoristas(id, nome, vendedor_id, user_regra_id, loja_id)
    `)
    .eq('id', ocId)
    .single();

  if (error || !oc) throw new Error('OC não encontrada');
  if (!podeAcessarLoja(regra, oc.loja_id)) {
    if (regra.nivel === 'motorista') {
      const { data: m } = await supabase.from('motoristas').select('id').eq('user_regra_id', regra.id).single();
      if (!m || oc.motorista_id !== m.id) throw new Error('Acesso negado');
    } else {
      throw new Error('Acesso negado');
    }
  }
  return oc;
}

/** Veículos disponíveis para uma loja (via veiculos_lojas) */
export async function getVeiculosByLoja(regra: UserRegraContext, lojaId: string) {
  if (!podeAcessarLoja(regra, lojaId)) throw new Error('Acesso negado à loja');
  const { data: vls, error } = await supabase
    .from('veiculos_lojas')
    .select('veiculo_id')
    .eq('loja_id', lojaId);
  if (error) throw error;
  const ids = (vls || []).map((v: any) => v.veiculo_id);
  if (ids.length === 0) return [];
  const { data: veiculos, error: err2 } = await supabase
    .from('veiculos')
    .select('id, placa, modelo, apelido, ativo')
    .in('id', ids)
    .eq('ativo', true);
  if (err2) throw err2;
  return veiculos || [];
}

/** Motoristas disponíveis para uma loja (vendedores ou motoristas dedicados) */
export async function getMotoristasByLoja(regra: UserRegraContext, lojaId: string) {
  if (!podeAcessarLoja(regra, lojaId)) throw new Error('Acesso negado à loja');
  const { data, error } = await supabase
    .from('motoristas')
    .select(`
      id, nome, ativo, loja_id, vendedor_id, user_regra_id,
      vendedor:vendedores(id, nome)
    `)
    .eq('ativo', true)
    .or(`loja_id.eq.${lojaId},loja_id.is.null`);
  if (error) throw error;
  return data || [];
}

/** Para usuário motorista: retorna o motorista_id vinculado ao user_regra_id */
export async function getMotoristaIdByUserRegra(userRegraId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('motoristas')
    .select('id')
    .eq('user_regra_id', userRegraId)
    .eq('ativo', true)
    .single();
  if (error || !data) return null;
  return data.id;
}

/** Cria OC aplicando regras: motorista auto-preenchido; loja com veículo da loja e motorista/vendedor da loja */
export async function createOc(regra: UserRegraContext, createdBy: string, body: {
  loja_id: string;
  veiculo_id: string;
  motorista_id?: string;
  vendedor_id?: string;
}) {
  const lojaId = body.loja_id;
  if (!podeAcessarLoja(regra, lojaId)) throw new Error('Acesso negado à loja');

  let motoristaId = body.motorista_id;
  let vendedorId = body.vendedor_id;

  if (regra.nivel === 'motorista') {
    const mid = await getMotoristaIdByUserRegra(regra.id);
    if (!mid) throw new Error('Motorista não encontrado para este usuário');
    motoristaId = mid;
    const { data: motorista } = await supabase.from('motoristas').select('vendedor_id').eq('id', mid).single();
    vendedorId = motorista?.vendedor_id || undefined;
  } else {
    if (!motoristaId) throw new Error('motorista_id é obrigatório');
    const { data: motorista } = await supabase.from('motoristas').select('vendedor_id').eq('id', motoristaId).single();
    vendedorId = vendedorId ?? motorista?.vendedor_id ?? undefined;
  }

  const veiculos = await getVeiculosByLoja(regra, lojaId);
  if (!veiculos.some((v: any) => v.id === body.veiculo_id)) throw new Error('Veículo não pertence à loja');

  const motoristas = await getMotoristasByLoja(regra, lojaId);
  if (!motoristas.some((m: any) => m.id === motoristaId)) throw new Error('Motorista não disponível para esta loja');

  const { data: oc, error } = await supabase
    .from('ocs')
    .insert({
      loja_id: lojaId,
      veiculo_id: body.veiculo_id,
      motorista_id: motoristaId,
      vendedor_id: vendedorId || null,
      status: 'ABERTA',
      created_by: createdBy,
    })
    .select(`
      *,
      loja:lojas(id, nome),
      veiculo:veiculos(id, placa, modelo, apelido),
      motorista:motoristas(id, nome)
    `)
    .single();

  if (error) throw error;
  return oc;
}

/** Atualiza km_saida e data_saida -> status EM_ANDAMENTO */
export async function updateOcSaida(regra: UserRegraContext, ocId: string, km_saida: number) {
  const oc = await getOcById(regra, ocId);
  if (oc.status !== 'ABERTA') throw new Error('OC não está ABERTA');
  const { data, error } = await supabase
    .from('ocs')
    .update({
      km_saida,
      data_saida: new Date().toISOString(),
      status: 'EM_ANDAMENTO',
    })
    .eq('id', ocId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Fecha OC: km_retorno, data_retorno, status FECHADA */
export async function fecharOc(regra: UserRegraContext, ocId: string, body: { km_retorno: number }) {
  const oc = await getOcById(regra, ocId);
  if (oc.status === 'FECHADA') throw new Error('OC já está FECHADA');
  if (body.km_retorno == null) throw new Error('km_retorno é obrigatório');
  if (oc.km_saida != null && body.km_retorno < oc.km_saida) throw new Error('km_retorno deve ser >= km_saida');

  const { data, error } = await supabase
    .from('ocs')
    .update({
      km_retorno: body.km_retorno,
      data_retorno: new Date().toISOString(),
      status: 'FECHADA',
    })
    .eq('id', ocId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Lista lançamentos de uma OC */
export async function listLancamentos(regra: UserRegraContext, ocId: string) {
  await getOcById(regra, ocId);
  const { data, error } = await supabase
    .from('oc_lancamentos')
    .select('*')
    .eq('oc_id', ocId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Adiciona lançamento a uma OC */
export async function createLancamento(regra: UserRegraContext, ocId: string, body: {
  categoria: LancamentoCategoria;
  descricao?: string;
  valor: number;
}) {
  await getOcById(regra, ocId);
  if (!LANCAMENTO_CATEGORIA.includes(body.categoria)) throw new Error('Categoria inválida');
  if (typeof body.valor !== 'number' || body.valor < 0) throw new Error('Valor inválido');

  const { data, error } = await supabase
    .from('oc_lancamentos')
    .insert({
      oc_id: ocId,
      categoria: body.categoria,
      descricao: body.descricao || null,
      valor: body.valor,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Dashboard: KPIs agregados (diretor/supervisor - múltiplas lojas) */
export async function getDashboardOc(regra: UserRegraContext, filters: {
  loja_id?: string;
  data_inicio?: string;
  data_fim?: string;
}) {
  const lojas = getLojasPermitidas(regra);
  if (lojas.length === 0) {
    return {
      total_ocs: 0,
      total_fechadas: 0,
      percentual_fechadas: 0,
      ocs_atraso: 0,
      custo_medio_km: 0,
      km_medio_oc: 0,
      ranking_lojas_ocs: [],
      ranking_lojas_atraso: [],
      ranking_custos_loja: [],
      evolucao_ocs: [],
      custos_por_categoria: [],
    };
  }

  let query = supabase.from('ocs').select('id, loja_id, status, km_saida, km_retorno, km_total, created_at').in('loja_id', lojas);
  if (filters.loja_id && lojas.includes(filters.loja_id)) {
    query = query.eq('loja_id', filters.loja_id);
  }
  if (filters.data_inicio) query = query.gte('created_at', filters.data_inicio);
  if (filters.data_fim) query = query.lte('created_at', filters.data_fim);

  const { data: ocs, error } = await query;
  if (error) throw error;
  const list = ocs || [];

  const totalOcs = list.length;
  const totalFechadas = list.filter((o: any) => o.status === 'FECHADA').length;
  const percentualFechadas = totalOcs > 0 ? Math.round((totalFechadas / totalOcs) * 100) : 0;

  const horasAtraso = 24;
  const limiteAtraso = new Date();
  limiteAtraso.setHours(limiteAtraso.getHours() - horasAtraso);
  const ocsAtraso = list.filter((o: any) => o.status !== 'FECHADA' && o.created_at && new Date(o.created_at) < limiteAtraso).length;

  const ocsComKm = list.filter((o: any) => o.km_total != null && o.km_total > 0);
  const totalKm = ocsComKm.reduce((s: number, o: any) => s + (o.km_total || 0), 0);
  const kmMedioOc = ocsComKm.length > 0 ? totalKm / ocsComKm.length : 0;

  const ocIds = list.map((o: any) => o.id);
  let custoPorOc: Record<string, number> = {};
  let custoTotal = 0;
  if (ocIds.length > 0) {
    const { data: lanc } = await supabase.from('oc_lancamentos').select('oc_id, valor, categoria').in('oc_id', ocIds);
    (lanc || []).forEach((l: any) => {
      custoPorOc[l.oc_id] = (custoPorOc[l.oc_id] || 0) + Number(l.valor);
      custoTotal += Number(l.valor);
    });
  }
  const custoMedioKm = totalKm > 0 ? custoTotal / totalKm : 0;

  const rankingLojasOcs: { loja_id: string; total: number }[] = [];
  const lojaCount: Record<string, number> = {};
  list.forEach((o: any) => {
    lojaCount[o.loja_id] = (lojaCount[o.loja_id] || 0) + 1;
  });
  Object.entries(lojaCount).forEach(([lid, total]) => rankingLojasOcs.push({ loja_id: lid, total }));
  rankingLojasOcs.sort((a, b) => b.total - a.total);

  const abertasOuAndamento = list.filter((o: any) => o.status !== 'FECHADA');
  const limiteAtraso2 = new Date();
  limiteAtraso2.setHours(limiteAtraso2.getHours() - horasAtraso);
  const atrasoPorLoja: Record<string, number> = {};
  abertasOuAndamento.forEach((o: any) => {
    if (o.created_at && new Date(o.created_at) < limiteAtraso2) {
      atrasoPorLoja[o.loja_id] = (atrasoPorLoja[o.loja_id] || 0) + 1;
    }
  });
  const rankingLojasAtraso = Object.entries(atrasoPorLoja).map(([loja_id, total]) => ({ loja_id, total })).sort((a, b) => b.total - a.total);

  const custoPorLoja: Record<string, number> = {};
  list.forEach((o: any) => {
    const c = custoPorOc[o.id] || 0;
    custoPorLoja[o.loja_id] = (custoPorLoja[o.loja_id] || 0) + c;
  });
  const rankingCustosLoja = Object.entries(custoPorLoja).map(([loja_id, total]) => ({ loja_id, total })).sort((a, b) => b.total - a.total);

  const porDia: Record<string, number> = {};
  list.forEach((o: any) => {
    const d = o.created_at ? o.created_at.slice(0, 10) : '';
    if (d) porDia[d] = (porDia[d] || 0) + 1;
  });
  const evolucaoOcs = Object.entries(porDia).map(([data, total]) => ({ data, total })).sort((a, b) => a.data.localeCompare(b.data));

  const catCount: Record<string, number> = {};
  if (ocIds.length > 0) {
    const { data: l2 } = await supabase.from('oc_lancamentos').select('categoria, valor').in('oc_id', ocIds);
    (l2 || []).forEach((l: any) => {
      catCount[l.categoria] = (catCount[l.categoria] || 0) + Number(l.valor);
    });
  }
  const custosPorCategoria = Object.entries(catCount).map(([categoria, valor]) => ({ categoria, valor }));

  return {
    total_ocs: totalOcs,
    total_fechadas: totalFechadas,
    percentual_fechadas: percentualFechadas,
    ocs_atraso: ocsAtraso,
    custo_medio_km: Math.round(custoMedioKm * 100) / 100,
    km_medio_oc: Math.round(kmMedioOc * 100) / 100,
    ranking_lojas_ocs: rankingLojasOcs,
    ranking_lojas_atraso: rankingLojasAtraso,
    ranking_custos_loja: rankingCustosLoja,
    evolucao_ocs: evolucaoOcs,
    custos_por_categoria: custosPorCategoria,
  };
}

/** Marcar OCs ABERTA antigas como ATRASADA (job ou ao listar) */
export async function atualizarStatusAtrasadas() {
  const horas = 24;
  const limite = new Date();
  limite.setHours(limite.getHours() - horas);
  const { data, error } = await supabase
    .from('ocs')
    .update({ status: 'ATRASADA' })
    .eq('status', 'ABERTA')
    .lt('created_at', limite.toISOString());
  if (error) throw error;
  return data;
}
