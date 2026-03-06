/**
 * Serviço OC Veículos - Toda a regra de negócio do módulo
 */
import { supabase } from '../config/supabase';

const OC_STATUS = ['ABERTA', 'EM_ANDAMENTO', 'FECHADA', 'ATRASADA'] as const;
const LANCAMENTO_CATEGORIA = ['combustivel', 'pedagio', 'manutencao', 'bateria', 'outros'] as const;

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

/** Diretores, gerentes e admins têm acesso global — sem filtro de loja */
function isGestorGlobalFn(regra: UserRegraContext): boolean {
  return (
    regra?.nivel === 'diretor' ||
    regra?.nivel === 'gerente' ||
    regra?.nivel === 'admin'
  );
}

/** Verifica se o usuário pode acessar uma loja específica */
function podeAcessarLoja(regra: UserRegraContext, lojaId: string): boolean {
  if (isGestorGlobalFn(regra)) return true;
  const lojas = getLojasPermitidas(regra);
  return lojas.includes(lojaId);
}

/** Filtra query de OCs por permissão */
function applyOcFilter(regra: UserRegraContext, query: any) {
  if (isGestorGlobalFn(regra)) return query;
  if (regra.nivel === 'motorista') return query;
  const lojas = getLojasPermitidas(regra);
  if (lojas.length === 0) return query.eq('id', '00000000-0000-0000-0000-000000000000');
  return query.in('loja_id', lojas);
}

function aplicarStatusAtrasadaLogico<T extends { status: OcStatus; data_saida?: string | null; data_hora_saida?: string | null }>(oc: T): T {
  if (oc.status !== 'EM_ANDAMENTO') return oc;
  const referencia = oc.data_hora_saida || oc.data_saida;
  if (!referencia) return oc;
  const saidaDate = new Date(referencia);
  if (Number.isNaN(saidaDate.getTime())) return oc;
  const limite = new Date();
  limite.setDate(limite.getDate() - 7);
  if (saidaDate < limite) {
    return { ...oc, status: 'ATRASADA' };
  }
  return oc;
}

/** Calcula data de início (domingo) e fim (sábado) da semana para uma data de referência
 *  Regra de negócio: semanas sempre são de domingo a domingo (7 dias contínuos).
 */
function getIntervaloSemana(date: Date): { inicio: string; fim: string } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=domingo,1=segunda,...,6=sábado

  // desloca para o domingo da semana corrente
  const diffToSunday = -day;
  const inicioDate = new Date(d);
  inicioDate.setDate(d.getDate() + diffToSunday);

  const fimDate = new Date(inicioDate);
  fimDate.setDate(inicioDate.getDate() + 6);

  const inicio = inicioDate.toISOString().slice(0, 10);
  const fim = fimDate.toISOString().slice(0, 10);
  return { inicio, fim };
}

/** Garante existência de oc_semana para loja/data e bloqueia criação se houver semanas anteriores em aberto */
async function ensureSemanaForOc(regra: UserRegraContext, lojaId: string, referencia: Date): Promise<string> {
  if (!podeAcessarLoja(regra, lojaId)) throw new Error('Acesso negado à loja');
  const { inicio, fim } = getIntervaloSemana(referencia);

  // Regra adicional: não permitir nova semana se a última semana anterior tiver OCs em atraso
  const { data: ultimaSemanaAnterior, error: errUltimaSemana } = await supabase
    .from('oc_semana')
    .select('id, data_inicio, data_fim')
    .eq('loja_id', lojaId)
    .lt('data_fim', inicio)
    .order('data_fim', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errUltimaSemana) throw errUltimaSemana;

  if (ultimaSemanaAnterior?.id) {
    const { data: ocsUltimaSemana, error: errOcsUltima } = await supabase
      .from('ocs')
      .select('id, status, data_saida, data_hora_saida')
      .eq('semana_id', ultimaSemanaAnterior.id);
    if (errOcsUltima) throw errOcsUltima;

    const existeOcAtrasada = (ocsUltimaSemana || []).some((oc: any) => {
      const ajustada = aplicarStatusAtrasadaLogico(oc);
      return ajustada.status === 'ATRASADA';
    });

    if (existeOcAtrasada) {
      throw new Error(
        'Não é possível criar uma nova semana: existe OC em atraso na semana anterior. Regularize as OCs em atraso antes de abrir uma nova semana.',
      );
    }
  }

  // Bloqueio: se existir semana anterior ABERTA para esta loja, não permite nova semana
  const { data: semanasAbertasAnteriores, error: errAbertas } = await supabase
    .from('oc_semana')
    .select('id, data_inicio, data_fim, status')
    .eq('loja_id', lojaId)
    .eq('status', 'ABERTA')
    .lt('data_fim', inicio);
  if (errAbertas) throw errAbertas;
  if (semanasAbertasAnteriores && semanasAbertasAnteriores.length > 0) {
    throw new Error('Existe semana anterior em aberto para esta loja. Feche a semana antes de lançar novas OCs.');
  }

  // Busca semana existente para este intervalo
  const { data: existing, error: errExisting } = await supabase
    .from('oc_semana')
    .select('id')
    .eq('loja_id', lojaId)
    .eq('data_inicio', inicio)
    .eq('data_fim', fim)
    .single();
  if (!errExisting && existing?.id) {
    return existing.id as string;
  }

  // Cria semana ABERTA
  const { data: created, error: errCreate } = await supabase
    .from('oc_semana')
    .insert({
      loja_id: lojaId,
      data_inicio: inicio,
      data_fim: fim,
      status: 'ABERTA',
    })
    .select('id')
    .single();
  if (errCreate || !created) throw errCreate || new Error('Erro ao criar semana da OC');
  return created.id as string;
}

/** Lista OCs com permissão por perfil. Aplica status ATRASADA de forma lógica (7 dias em andamento). */
export async function listOcs(regra: UserRegraContext, filters: {
  loja_id?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
  semana_id?: string;
}) {
  let query = supabase
    .from('ocs')
    .select(`
      id, loja_id, veiculo_id, motorista_id, vendedor_id,
      km_saida, km_retorno, km_total, status, data_saida, data_retorno, data_hora_saida, semana_id,
      created_by, created_at,
      loja:lojas(id, nome, cidade, estado),
      veiculo:veiculos(id, placa, modelo, apelido, renavam),
      motorista:motoristas(
        id,
        nome,
        vendedor_id,
        user_regra_id,
        loja_id,
        vendedor:vendedores(id, nome)
      )
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
  if (filters.semana_id) {
    query = query.eq('semana_id', filters.semana_id);
  }
  if (filters.data_inicio) {
    // Filtro por período deve considerar a data de criação da OC (created_at)
    // e incluir o dia inteiro (00:00 até 23:59:59)
    const inicio = `${filters.data_inicio}T00:00:00`;
    query = query.gte('created_at', inicio);
  }
  if (filters.data_fim) {
    const fim = `${filters.data_fim}T23:59:59.999`;
    query = query.lte('created_at', fim);
  }

  const { data, error } = await query;
  if (error) throw error;
  const list = (data || []) as any[];

  // Aplica status ATRASADA de forma lógica (7 dias desde a saída)
  const ajustadas = list.map((oc) => aplicarStatusAtrasadaLogico(oc));

  return ajustadas;
}

/** Busca OC por ID com verificação de acesso */
export async function getOcById(regra: UserRegraContext, ocId: string) {
  const { data: oc, error } = await supabase
    .from('ocs')
    .select(`
      *,
      loja:lojas(id, nome, cidade, estado),
      veiculo:veiculos(id, placa, modelo, apelido, renavam),
      motorista:motoristas(
        id,
        nome,
        vendedor_id,
        user_regra_id,
        loja_id,
        vendedor:vendedores(id, nome)
      ),
      vendedor:vendedores(id, nome)
    `)
    .eq('id', ocId)
    .single();

  if (error || !oc) throw new Error('OC não encontrada');
  const ocAjustada = aplicarStatusAtrasadaLogico(oc as any);
  if (!podeAcessarLoja(regra, oc.loja_id)) {
    if (regra.nivel === 'motorista') {
      const { data: m } = await supabase.from('motoristas').select('id').eq('user_regra_id', regra.id).single();
      if (!m || ocAjustada.motorista_id !== m.id) throw new Error('Acesso negado');
    } else {
      throw new Error('Acesso negado');
    }
  }
  return ocAjustada;
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
    .select('id, placa, modelo, apelido, renavam, ativo')
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
    // Regra nova: aceitar motorista_id OU vendedor_id
    // Se não veio motorista_id mas veio vendedor_id, localizar/criar motorista vinculado a esse vendedor
    if (!motoristaId && vendedorId) {
      // Tenta achar motorista existente para esse vendedor na loja
      const { data: existingMotorista } = await supabase
        .from('motoristas')
        .select('id')
        .eq('loja_id', lojaId)
        .eq('vendedor_id', vendedorId)
        .single();

      if (existingMotorista?.id) {
        motoristaId = existingMotorista.id;
      } else {
        // Cria motorista vinculado ao vendedor e à loja
        const novoMotorista = await createMotorista(regra, {
          loja_id: lojaId,
          vendedor_id: vendedorId,
        });
        motoristaId = novoMotorista.id;
      }
    }

    if (!motoristaId && !vendedorId) {
      throw new Error('motorista_id é obrigatório');
    }

    const { data: motorista } = await supabase
      .from('motoristas')
      .select('vendedor_id')
      .eq('id', motoristaId as string)
      .single();

    vendedorId = vendedorId ?? motorista?.vendedor_id ?? undefined;
  }

  const veiculos = await getVeiculosByLoja(regra, lojaId);
  if (!veiculos.some((v: any) => v.id === body.veiculo_id)) throw new Error('Veículo não pertence à loja');

  const motoristas = await getMotoristasByLoja(regra, lojaId);
  if (!motoristas.some((m: any) => m.id === motoristaId)) throw new Error('Motorista não disponível para esta loja');

  // Regra de negócio: veículo em oficina não pode abrir nova OC
  const { data: veiculoStatus, error: errVeicStatus } = await supabase
    .from('veiculos')
    .select('status_uso')
    .eq('id', body.veiculo_id)
    .single();
  if (errVeicStatus) throw errVeicStatus;
  if (veiculoStatus?.status_uso === 'EM_OFICINA') {
    throw new Error('Veículo em oficina não pode abrir OC');
  }

  // Garante semana da OC (criação automática + bloqueio de semanas anteriores em aberto)
  const agora = new Date();
  const semanaId = await ensureSemanaForOc(regra, lojaId, agora);

  const { data: oc, error } = await supabase
    .from('ocs')
    .insert({
      loja_id: lojaId,
      veiculo_id: body.veiculo_id,
      motorista_id: motoristaId,
      vendedor_id: vendedorId || null,
      semana_id: semanaId,
      status: 'ABERTA',
      created_by: createdBy,
    })
    .select(`
      *,
      loja:lojas(id, nome),
      veiculo:veiculos(id, placa, modelo, apelido, renavam),
      motorista:motoristas(id, nome)
    `)
    .single();

  if (error) throw error;

  // Atualiza status de uso do veículo para EM_OC (exceto se já estiver marcado como EM_OFICINA)
  const nextStatusUso = veiculoStatus?.status_uso === 'EM_OFICINA' ? veiculoStatus.status_uso : 'EM_OC';
  await supabase
    .from('veiculos')
    .update({ status_uso: nextStatusUso })
    .eq('id', body.veiculo_id);

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
      data_hora_saida: new Date().toISOString(),
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
      km_total: oc.km_saida != null ? body.km_retorno - oc.km_saida : oc.km_total ?? null,
      data_retorno: new Date().toISOString(),
      status: 'FECHADA',
    })
    .eq('id', ocId)
    .select()
    .single();
  if (error) throw error;

  // Atualiza km_atual e status_uso do veículo com base no fechamento da OC
  if (oc.veiculo_id) {
    const { data: veiculoAtual, error: errVeic } = await supabase
      .from('veiculos')
      .select('km_atual, status_uso')
      .eq('id', oc.veiculo_id)
      .single();
    if (!errVeic && veiculoAtual) {
      const kmAtualExistente = typeof veiculoAtual.km_atual === 'number' ? veiculoAtual.km_atual : 0;
      const novoKmAtual = Math.max(kmAtualExistente, body.km_retorno);
      const novoStatusUso = veiculoAtual.status_uso === 'EM_OFICINA' ? veiculoAtual.status_uso : 'DISPONIVEL';
      await supabase
        .from('veiculos')
        .update({ km_atual: novoKmAtual, status_uso: novoStatusUso })
        .eq('id', oc.veiculo_id);
    }
  }

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
      semanas_abertas: 0,
      trocas_oleo_vencidas: 0,
      veiculos_em_oficina: 0,
      semanas_recentes: [],
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
  const listRaw = ocs || [];
  // Aplica regra de ATRASADA de forma consistente com listOcs/getOcById (7 dias a partir da saída)
  const list = listRaw.map((o: any) => aplicarStatusAtrasadaLogico(o));

  const totalOcs = list.length;
  const totalFechadas = list.filter((o: any) => o.status === 'FECHADA').length;
  const percentualFechadas = totalOcs > 0 ? Math.round((totalFechadas / totalOcs) * 100) : 0;

  const ocsComKm = list.filter((o: any) => {
    const kmTotal = o.km_total != null
      ? Number(o.km_total)
      : (o.km_saida != null && o.km_retorno != null ? Number(o.km_retorno) - Number(o.km_saida) : 0);
    return kmTotal > 0;
  });

  const totalKm = ocsComKm.reduce((s: number, o: any) => {
    const kmTotal = o.km_total != null
      ? Number(o.km_total)
      : (o.km_saida != null && o.km_retorno != null ? Number(o.km_retorno) - Number(o.km_saida) : 0);
    return s + kmTotal;
  }, 0);

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

  const atrasoPorLoja: Record<string, number> = {};
  list.forEach((o: any) => {
    if (o.status === 'ATRASADA') {
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

  // Novos KPIs de frota e semanas recentes
  const lojasFiltro = filters.loja_id && lojas.includes(filters.loja_id) ? [filters.loja_id] : lojas;

  // Contagem de semanas abertas em oc_semana + identificação de semanas com atraso
  let semanasAbertas = 0;
  let semanasRecentes: any[] = [];

  if (lojasFiltro.length > 0) {
    const { count: semanasAbertasCount, error: errSemanasAbertas } = await supabase
      .from('oc_semana')
      .select('id', { count: 'exact', head: true })
      .in('loja_id', lojasFiltro)
      .eq('status', 'ABERTA');
    if (errSemanasAbertas) throw errSemanasAbertas;
    semanasAbertas = semanasAbertasCount || 0;

    const SEMANAS_RECENTES_LIMIT = 6;
    const { data: semanasRecentesData, error: errSemanasRecentes } = await supabase
      .from('oc_semana')
      .select('id, loja_id, data_inicio, data_fim, status, total_custos, total_km, total_combustivel_litros, total_combustivel_valor')
      .in('loja_id', lojasFiltro)
      .order('data_inicio', { ascending: false })
      .limit(SEMANAS_RECENTES_LIMIT);
    if (errSemanasRecentes) throw errSemanasRecentes;
    semanasRecentes = semanasRecentesData || [];

    // Marca semanas que possuem pelo menos uma OC em atraso (status lógico ATRASADA)
    const semanaIds = semanasRecentes.map((s: any) => s.id);
    if (semanaIds.length > 0) {
      const { data: ocsDasSemanas, error: errOcsSemanas } = await supabase
        .from('ocs')
        .select('id, semana_id, status, data_saida, data_hora_saida')
        .in('semana_id', semanaIds);
      if (errOcsSemanas) throw errOcsSemanas;

      const semanasComAtraso = new Set<string>();
      (ocsDasSemanas || []).forEach((oc: any) => {
        const ajustada = aplicarStatusAtrasadaLogico(oc);
        if (ajustada.status === 'ATRASADA' && ajustada.semana_id) {
          semanasComAtraso.add(ajustada.semana_id);
        }
      });

      semanasRecentes = semanasRecentes.map((s: any) => ({
        ...s,
        tem_atraso: semanasComAtraso.has(s.id),
      }));
    }
  }

  // Veículos das lojas permitidas via veiculos_lojas
  let trocasOleoVencidas = 0;
  let veiculosEmOficina = 0;

  if (lojasFiltro.length > 0) {
    const { data: vls, error: errVls } = await supabase
      .from('veiculos_lojas')
      .select('veiculo_id')
      .in('loja_id', lojasFiltro);
    if (errVls) throw errVls;
    const veiculoIds = [...new Set((vls || []).map((v: any) => v.veiculo_id))];

    if (veiculoIds.length > 0) {
      const { count: trocasCount, error: errTrocas } = await supabase
        .from('veiculo_manutencao')
        .select('id', { count: 'exact', head: true })
        .in('veiculo_id', veiculoIds)
        .eq('tipo', 'troca_oleo')
        .eq('status', 'VENCIDA');
      if (errTrocas) throw errTrocas;
      trocasOleoVencidas = trocasCount || 0;

      const { count: veiculosOficinaCount, error: errVeiculosOficina } = await supabase
        .from('veiculos')
        .select('id', { count: 'exact', head: true })
        .in('id', veiculoIds)
        .eq('status_uso', 'EM_OFICINA');
      if (errVeiculosOficina) throw errVeiculosOficina;
      veiculosEmOficina = veiculosOficinaCount || 0;
    }
  }

  // Total de OCs em atraso (status ajustado logicamente para ATRASADA)
  const ocsAtraso = list.filter((o: any) => o.status === 'ATRASADA').length;

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
    semanas_abertas: semanasAbertas,
    trocas_oleo_vencidas: trocasOleoVencidas,
    veiculos_em_oficina: veiculosEmOficina,
    semanas_recentes: semanasRecentes,
  };
}

/** Lista semanas de OC por loja/ano/mês com permissão */
export async function listSemanas(regra: UserRegraContext, filters: {
  loja_id?: string;
  ano?: number;
  mes?: number;
  status?: 'ABERTA' | 'FECHADA';
}) {
  const lojasPermitidas = getLojasPermitidas(regra);
  const isGestorGlobal = isGestorGlobalFn(regra);

  let query = supabase
    .from('oc_semana')
    .select('id, loja_id, data_inicio, data_fim, status, total_custos, total_km, total_combustivel_litros, total_combustivel_valor')
    .order('data_inicio', { ascending: false });

  if (!isGestorGlobal) {
    if (lojasPermitidas.length === 0) {
      return [];
    }
    if (filters.loja_id && lojasPermitidas.includes(filters.loja_id)) {
      query = query.eq('loja_id', filters.loja_id);
    } else {
      query = query.in('loja_id', lojasPermitidas);
    }
  } else if (filters.loja_id) {
    query = query.eq('loja_id', filters.loja_id);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.ano) {
    query = query.gte('data_inicio', `${filters.ano}-01-01`).lte('data_fim', `${filters.ano}-12-31`);
  }
  if (filters.mes) {
    const ano = filters.ano ?? new Date().getFullYear();
    const mes = String(filters.mes).padStart(2, '0');
    const inicio = `${ano}-${mes}-01`;
    const fimDate = new Date(ano, filters.mes, 0); // último dia do mês
    const fim = `${ano}-${mes}-${String(fimDate.getDate()).padStart(2, '0')}`;
    query = query.gte('data_inicio', inicio).lte('data_fim', fim);
  }

  const { data, error } = await query;
  if (error) throw error;
  const semanas = (data || []) as any[];

  if (semanas.length === 0) return semanas;

  // Marca semanas que possuem pelo menos uma OC em atraso (status lógico ATRASADA)
  const semanaIds = semanas.map((s: any) => s.id);
  const { data: ocsDasSemanas, error: errOcsSemanas } = await supabase
    .from('ocs')
    .select('id, semana_id, status, data_saida, data_hora_saida')
    .in('semana_id', semanaIds);
  if (errOcsSemanas) throw errOcsSemanas;

  const semanasComAtraso = new Set<string>();
  (ocsDasSemanas || []).forEach((oc: any) => {
    const ajustada = aplicarStatusAtrasadaLogico(oc);
    if (ajustada.status === 'ATRASADA' && ajustada.semana_id) {
      semanasComAtraso.add(ajustada.semana_id);
    }
  });

  return semanas.map((s: any) => ({
    ...s,
    tem_atraso: semanasComAtraso.has(s.id),
  }));
}

/** Detalhe de uma semana: resumo, abastecimentos e OCs */
export async function getSemanaDetalhe(regra: UserRegraContext, semanaId: string) {
  const { data: semana, error } = await supabase
    .from('oc_semana')
    .select('id, loja_id, data_inicio, data_fim, status, total_custos, total_km, total_combustivel_litros, total_combustivel_valor')
    .eq('id', semanaId)
    .single();
  if (error || !semana) throw new Error('Semana não encontrada');

  if (semana.loja_id && !podeAcessarLoja(regra, semana.loja_id)) {
    throw new Error('Acesso negado à loja');
  }

  // Abastecimentos da semana
  const { data: combustivel, error: errComb } = await supabase
    .from('oc_semana_combustivel')
    .select(`
      id, semana_id, veiculo_id, data_abastecimento, litros, valor_total, oc_id, observacao, created_at,
      veiculo:veiculos(id, placa, modelo, apelido, renavam)
    `)
    .eq('semana_id', semanaId)
    .order('data_abastecimento', { ascending: true });
  if (errComb) throw errComb;

  // OCs da semana
  const { data: ocs, error: errOcs } = await supabase
    .from('ocs')
    .select(`
      id, loja_id, veiculo_id, motorista_id, vendedor_id,
      km_saida, km_retorno, km_total, status, data_saida, data_retorno, data_hora_saida, created_at,
      loja:lojas(id, nome, cidade, estado),
      veiculo:veiculos(id, placa, modelo, apelido, renavam),
      motorista:motoristas(id, nome, vendedor_id, user_regra_id, loja_id, vendedor:vendedores(id, nome))
    `)
    .eq('semana_id', semanaId)
    .order('created_at', { ascending: true });
  if (errOcs) throw errOcs;

  const ocList = (ocs || []).map((oc: any) => aplicarStatusAtrasadaLogico(oc));
  const ocIds = ocList.map((o: any) => o.id);

  // Resumo de baterias por OC
  let bateriasPorOc: Record<string, { quant: number; valor: number; descricao: string | null; pedido: string | null }> = {};
  if (ocIds.length > 0) {
    const { data: lanc, error: errLanc } = await supabase
      .from('oc_lancamentos')
      .select('oc_id, categoria, valor, descricao, quantidade_baterias, pedido_bateria')
      .in('oc_id', ocIds)
      .eq('categoria', 'bateria');
    if (errLanc) throw errLanc;
    (lanc || []).forEach((l: any) => {
      const current = bateriasPorOc[l.oc_id] || { quant: 0, valor: 0, descricao: null, pedido: null };
      const quant = current.quant + (Number(l.quantidade_baterias) || 0 || 1);
      const valor = current.valor + Number(l.valor || 0);
      bateriasPorOc[l.oc_id] = {
        quant,
        valor,
        descricao: l.descricao || current.descricao,
        pedido: l.pedido_bateria || current.pedido,
      };
    });
  }

  const ocsComResumo = ocList.map((oc: any) => {
    const resumo = bateriasPorOc[oc.id];
    return {
      ...oc,
      baterias_resumo: resumo || null,
    };
  });

  const totalLitros = (combustivel || []).reduce((s: number, c: any) => s + Number(c.litros || 0), 0);
  const totalCombustivelValor = (combustivel || []).reduce((s: number, c: any) => s + Number(c.valor_total || 0), 0);
  const totalKm = (ocs || []).reduce((s: number, o: any) => s + Number(o.km_total || 0), 0);
  const mediaKmPorLitro = totalLitros > 0 ? totalKm / totalLitros : 0;

  const resumo = {
    total_litros: totalLitros,
    total_combustivel_valor: totalCombustivelValor,
    total_km: totalKm,
    media_km_por_litro: mediaKmPorLitro,
  };

  return {
    semana,
    combustivel: combustivel || [],
    ocs: ocsComResumo,
    resumo,
  };
}

/** Fecha uma semana (status = FECHADA) com verificação de acesso */
export async function fecharSemana(regra: UserRegraContext, semanaId: string) {
  const { data: semana, error } = await supabase
    .from('oc_semana')
    .select('id, loja_id, status')
    .eq('id', semanaId)
    .single();
  if (error || !semana) throw new Error('Semana não encontrada');
  if (regra.nivel === 'motorista') throw new Error('Acesso negado à loja');
  if (semana.loja_id && !podeAcessarLoja(regra, semana.loja_id)) {
    throw new Error('Acesso negado à loja');
  }
  if (semana.status === 'FECHADA') {
    return semana;
  }
  const { data: updated, error: errUpd } = await supabase
    .from('oc_semana')
    .update({ status: 'FECHADA' })
    .eq('id', semanaId)
    .select('id, loja_id, status')
    .single();
  if (errUpd || !updated) throw errUpd || new Error('Erro ao fechar semana');
  return updated;
}

/** Marcar OCs ABERTA antigas como ATRASADA (job ou ao listar) */
export async function atualizarStatusAtrasadas() {
  // Lógica de atraso agora é aplicada de forma \"on the fly\" em listOcs/getOcById,
  // então esta função passa a ser um no-op mantido apenas por compatibilidade.
  return null;
}

/** Lista veículos (todos das lojas permitidas ou filtrado por loja_id) */
export async function listVeiculos(regra: UserRegraContext, lojaId?: string, status?: 'ativo' | 'inativo') {
  const isGestorGlobal = regra.nivel === 'diretor' || regra.nivel === 'admin';

  let vlsQuery = supabase
    .from('veiculos_lojas')
    .select('veiculo_id, loja_id');

  if (isGestorGlobal) {
    // Diretor/Admin: pode ver veículos de qualquer loja; se lojaId vier, filtra por ela
    if (lojaId) {
      vlsQuery = vlsQuery.eq('loja_id', lojaId);
    }
  } else {
    const lojas = getLojasPermitidas(regra);
    if (lojas.length === 0) return [];
    const idsToUse = lojaId && lojas.includes(lojaId) ? [lojaId] : lojas;
    vlsQuery = vlsQuery.in('loja_id', idsToUse);
  }

  const { data: vls, error } = await vlsQuery;
  if (error) throw error;
  const veiculoIds = [...new Set((vls || []).map((v: any) => v.veiculo_id))];
  const lojaPorVeiculo: Record<string, string> = {};
  (vls || []).forEach((v: any) => {
    if (!lojaPorVeiculo[v.veiculo_id]) {
      lojaPorVeiculo[v.veiculo_id] = v.loja_id;
    }
  });
  if (veiculoIds.length === 0) return [];
  let veicQuery = supabase
    .from('veiculos')
    .select('id, placa, modelo, apelido, renavam, ativo, created_at')
    .in('id', veiculoIds);
  if (status === 'ativo') {
    veicQuery = veicQuery.eq('ativo', true);
  } else if (status === 'inativo') {
    veicQuery = veicQuery.eq('ativo', false);
  }
  const { data: veiculos, error: err2 } = await veicQuery.order('placa');
  if (err2) throw err2;
  const list = veiculos || [];
  return list.map((v: any) => ({
    ...v,
    loja_id: lojaPorVeiculo[v.id] || null,
  }));
}

/** Cria veículo e vincula à loja (veiculos_lojas) */
export async function createVeiculo(regra: UserRegraContext, body: {
  placa: string;
  modelo?: string;
  apelido?: string;
  renavam?: string;
  loja_id: string;
}) {
  if (!podeAcessarLoja(regra, body.loja_id)) throw new Error('Acesso negado à loja');
  const placa = (body.placa || '').trim().toUpperCase();
  if (!placa) throw new Error('Placa é obrigatória');

  // Regra de negócio: não permitir veículos com mesma placa
  const { data: existentes, error: errExist } = await supabase
    .from('veiculos')
    .select('id')
    .eq('placa', placa)
    .limit(1);
  if (errExist) throw errExist;
  if (existentes && existentes.length > 0) {
    throw new Error('Já existe veículo cadastrado com essa placa');
  }

  const { data: veiculo, error } = await supabase
    .from('veiculos')
    .insert({
      placa,
      modelo: body.modelo?.trim() || null,
      apelido: body.apelido?.trim() || null,
      renavam: body.renavam?.trim() || null,
      ativo: true,
    })
    .select()
    .single();
  if (error) throw error;
  const { error: err2 } = await supabase
    .from('veiculos_lojas')
    .insert({ veiculo_id: veiculo.id, loja_id: body.loja_id });
  if (err2) throw err2;
  return veiculo;
}

/** Busca veículo por ID com verificação de acesso às lojas vinculadas */
export async function getVeiculoById(regra: UserRegraContext, veiculoId: string) {
  const { data: veiculo, error } = await supabase
    .from('veiculos')
    .select('id, placa, modelo, apelido, renavam, ativo, created_at')
    .eq('id', veiculoId)
    .single();
  if (error || !veiculo) throw new Error('Veículo não encontrado');

  const { data: links, error: errLinks } = await supabase
    .from('veiculos_lojas')
    .select('loja_id')
    .eq('veiculo_id', veiculoId);
  if (errLinks) throw errLinks;
  const lojaIds = (links || []).map((l: any) => l.loja_id);

  const lojasPermitidas = getLojasPermitidas(regra);
  const isGestorGlobal = regra.nivel === 'diretor' || regra.nivel === 'admin';

  if (!isGestorGlobal) {
    if (lojaIds.length === 0) {
      throw new Error('Acesso negado à loja');
    }
    const temAcesso = lojaIds.some((id: string) => lojasPermitidas.includes(id));
    if (!temAcesso) {
      throw new Error('Acesso negado à loja');
    }
  }

  return veiculo;
}

/** Atualiza dados do veículo (inclusive ativo/inativo) */
export async function updateVeiculo(regra: UserRegraContext, veiculoId: string, body: {
  loja_id?: string;
  placa?: string;
  modelo?: string;
  apelido?: string;
  renavam?: string;
  ativo?: boolean;
}) {
  const veiculo = await getVeiculoById(regra, veiculoId);

  const updates: any = {};

  if (body.placa !== undefined) {
    const placa = (body.placa || '').trim().toUpperCase();
    if (!placa) throw new Error('Placa é obrigatória');

    const { data: existentes, error: errExist } = await supabase
      .from('veiculos')
      .select('id')
      .eq('placa', placa)
      .neq('id', veiculoId)
      .limit(1);
    if (errExist) throw errExist;
    if (existentes && existentes.length > 0) {
      throw new Error('Já existe veículo cadastrado com essa placa');
    }

    updates.placa = placa;
  }

  if (body.modelo !== undefined) {
    updates.modelo = body.modelo?.trim() || null;
  }
  if (body.apelido !== undefined) {
    updates.apelido = body.apelido?.trim() || null;
  }
  if (body.renavam !== undefined) {
    const renavam = body.renavam?.trim() || null;
    if (renavam) {
      const onlyDigits = /^[0-9]{9,12}$/;
      if (!onlyDigits.test(renavam)) {
        throw new Error('Renavam inválido');
      }
    }
    updates.renavam = renavam;
  }
  if (body.ativo !== undefined) {
    updates.ativo = body.ativo;
  }

  const { data: updated, error } = await supabase
    .from('veiculos')
    .update(updates)
    .eq('id', veiculoId)
    .select('id, placa, modelo, apelido, renavam, ativo, created_at')
    .single();
  if (error) throw error;

  // Opcionalmente permitir trocar a loja principal
  if (body.loja_id) {
    if (!podeAcessarLoja(regra, body.loja_id)) throw new Error('Acesso negado à loja');
    const { error: errDel } = await supabase
      .from('veiculos_lojas')
      .delete()
      .eq('veiculo_id', veiculoId);
    if (errDel) throw errDel;
    const { error: errIns } = await supabase
      .from('veiculos_lojas')
      .insert({ veiculo_id: veiculoId, loja_id: body.loja_id });
    if (errIns) throw errIns;
  }

  return updated || veiculo;
}

/** Lista manutenções de veículos (veiculo_manutencao) respeitando permissões de loja */
export async function listManutencoes(regra: UserRegraContext, filters: {
  loja_id?: string;
  veiculo_id?: string;
  status?: 'AGENDADA' | 'REALIZADA' | 'VENCIDA';
  tipo?: string;
}) {
  const isGestorGlobal = isGestorGlobalFn(regra);

  // Descobre veículos acessíveis
  let vlsQuery = supabase
    .from('veiculos_lojas')
    .select('veiculo_id, loja_id');

  if (isGestorGlobal) {
    if (filters.loja_id) {
      vlsQuery = vlsQuery.eq('loja_id', filters.loja_id);
    }
  } else {
    const lojas = getLojasPermitidas(regra);
    if (lojas.length === 0) return [];
    const lojasFiltro = filters.loja_id && lojas.includes(filters.loja_id) ? [filters.loja_id] : lojas;
    vlsQuery = vlsQuery.in('loja_id', lojasFiltro);
  }

  const { data: vls, error: errVls } = await vlsQuery;
  if (errVls) throw errVls;
  const veiculoPorLoja: Record<string, string> = {};
  const veiculoIds = [...new Set((vls || []).map((v: any) => {
    veiculoPorLoja[v.veiculo_id] = v.loja_id;
    return v.veiculo_id;
  }))];

  if (filters.veiculo_id) {
    if (!veiculoIds.includes(filters.veiculo_id)) {
      return [];
    }
  }

  if (veiculoIds.length === 0) return [];

  let manutQuery = supabase
    .from('veiculo_manutencao')
    .select('id, veiculo_id, tipo, data_manutencao, km_troca, km_proxima_troca, observacao, status, oc_id, created_at')
    .in('veiculo_id', filters.veiculo_id ? [filters.veiculo_id] : veiculoIds)
    .order('data_manutencao', { ascending: false });

  if (filters.status) {
    manutQuery = manutQuery.eq('status', filters.status);
  }
  if (filters.tipo) {
    manutQuery = manutQuery.eq('tipo', filters.tipo);
  }

  const { data, error } = await manutQuery;
  if (error) throw error;
  const list = data || [];
  return list.map((m: any) => ({
    ...m,
    loja_id: veiculoPorLoja[m.veiculo_id] || null,
  }));
}

/** Cria manutenção de veículo (troca de óleo, revisão, etc.) */
export async function createManutencao(regra: UserRegraContext, body: {
  veiculo_id: string;
  tipo: string;
  data_manutencao: string;
  km_troca: number;
  km_proxima_troca: number;
  observacao?: string | null;
  status?: 'AGENDADA' | 'REALIZADA' | 'VENCIDA';
}) {
  // Verifica acesso ao veículo via loja
  const { data: vls, error: errVls } = await supabase
    .from('veiculos_lojas')
    .select('loja_id')
    .eq('veiculo_id', body.veiculo_id);
  if (errVls) throw errVls;
  const lojaId = (vls && vls[0]?.loja_id) || null;
  if (lojaId && !podeAcessarLoja(regra, lojaId)) throw new Error('Acesso negado à loja');

  const status = body.status || 'AGENDADA';
  if (!['AGENDADA', 'REALIZADA', 'VENCIDA'].includes(status)) {
    throw new Error('Status de manutenção inválido');
  }

  const { data, error } = await supabase
    .from('veiculo_manutencao')
    .insert({
      veiculo_id: body.veiculo_id,
      tipo: body.tipo,
      data_manutencao: body.data_manutencao,
      km_troca: body.km_troca,
      km_proxima_troca: body.km_proxima_troca,
      observacao: body.observacao ?? null,
      status,
    })
    .select('id, veiculo_id, tipo, data_manutencao, km_troca, km_proxima_troca, observacao, status, oc_id, created_at')
    .single();
  if (error) throw error;
  return {
    ...data,
    loja_id: lojaId,
  };
}

/** Remove veículo se não possuir OCs vinculadas */
export async function deleteVeiculo(regra: UserRegraContext, veiculoId: string) {
  await getVeiculoById(regra, veiculoId);

  const { data: ocs, error: errOcs } = await supabase
    .from('ocs')
    .select('id')
    .eq('veiculo_id', veiculoId)
    .limit(1);
  if (errOcs) throw errOcs;
  if (ocs && ocs.length > 0) {
    throw new Error('Não é possível remover veículo com OCs vinculadas');
  }

  const { error: errLinks } = await supabase
    .from('veiculos_lojas')
    .delete()
    .eq('veiculo_id', veiculoId);
  if (errLinks) throw errLinks;

  const { error } = await supabase
    .from('veiculos')
    .delete()
    .eq('id', veiculoId);
  if (error) throw error;

  return true;
}

/** Lista motoristas (das lojas permitidas ou filtrado por loja_id) */
export async function listMotoristas(regra: UserRegraContext, lojaId?: string) {
  const isGestorGlobal = regra.nivel === 'diretor' || regra.nivel === 'admin';

  let query = supabase
    .from('motoristas')
    .select(`
      id, nome, ativo, loja_id, vendedor_id, user_regra_id, created_at,
      vendedor:vendedores(id, nome)
    `)
    .order('nome');

  if (isGestorGlobal) {
    if (lojaId) {
      query = query.eq('loja_id', lojaId);
    }
  } else {
    const lojas = getLojasPermitidas(regra);
    if (lojas.length === 0) return [];
    const idsToUse = lojaId && lojas.includes(lojaId) ? [lojaId] : lojas;
    query = query.in('loja_id', idsToUse);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Cria motorista (vendedor_id OU user_regra_id) */
export async function createMotorista(regra: UserRegraContext, body: {
  nome?: string;
  loja_id?: string;
  vendedor_id?: string;
  user_regra_id?: string;
}) {
  const hasVendedor = !!body.vendedor_id;
  const hasUserRegra = !!body.user_regra_id;
  if (hasVendedor === hasUserRegra) throw new Error('Informe vendedor_id ou user_regra_id (apenas um)');
  if (body.loja_id && !podeAcessarLoja(regra, body.loja_id)) throw new Error('Acesso negado à loja');
  if (body.vendedor_id) {
    const { data: v } = await supabase.from('vendedores').select('loja_id').eq('id', body.vendedor_id).single();
    if (!v) throw new Error('Vendedor não encontrado');
    if (body.loja_id && v.loja_id !== body.loja_id) throw new Error('Vendedor não pertence à loja');
  }
  if (body.user_regra_id) {
    const { data: u } = await supabase.from('users_regras').select('id, nivel').eq('id', body.user_regra_id).single();
    if (!u) throw new Error('Usuário não encontrado');
    if (u.nivel !== 'motorista') throw new Error('O user_regra deve ter nivel motorista');
  }
  const { data, error } = await supabase
    .from('motoristas')
    .insert({
      nome: body.nome?.trim() || null,
      ativo: true,
      loja_id: body.loja_id || null,
      vendedor_id: body.vendedor_id || null,
      user_regra_id: body.user_regra_id || null,
    })
    .select(`
      id, nome, ativo, loja_id, vendedor_id, user_regra_id, created_at,
      vendedor:vendedores(id, nome)
    `)
    .single();
  if (error) throw error;
  return data;
}

/** Lista users_regras com nivel = motorista (para dropdown cadastro motorista) */
export async function listUsuariosMotoristas(regra: UserRegraContext) {
  getLojasPermitidas(regra);
  const { data, error } = await supabase
    .from('users_regras')
    .select('id, nome, email')
    .eq('nivel', 'motorista')
    .order('nome');
  if (error) throw error;
  return data || [];
}
