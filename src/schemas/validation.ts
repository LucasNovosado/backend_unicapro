import { z } from 'zod';

// Auth
export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres')
  })
});

// Produtos
export const createProdutoSchema = z.object({
  body: z.object({
    nome: z.string().min(1),
    sku: z.string().optional(),
    categoria_id: z.string().uuid('Categoria ID deve ser um UUID válido').optional(),
    categoria: z.string().optional(), // Mantido para compatibilidade - será convertido para categoria_id
    quantidade_disponivel: z.number().int().min(0).default(0),
    ativo: z.boolean().default(true),
    estoque_minimo: z.number().int().min(0).default(0),
    imagem_url: z.string().url().optional(),
    image_1_url: z.string().url().optional(),
    image_2_url: z.string().url().optional(),
    image_3_url: z.string().url().optional(),
    imagem_capa_index: z.number().int().min(1).max(3).default(1)
  }).refine(
    (data) => data.categoria_id || data.categoria,
    { message: 'Categoria (categoria_id ou categoria) é obrigatória' }
  )
});

export const updateProdutoSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    nome: z.string().min(1).optional(),
    sku: z.string().optional(),
    categoria_id: z.string().uuid('Categoria ID deve ser um UUID válido').optional(),
    categoria: z.string().optional(),
    quantidade_disponivel: z.number().int().min(0).optional(),
    ativo: z.boolean().optional(),
    estoque_minimo: z.number().int().min(0).optional(),
    imagem_url: z.string().url().optional(),
    image_1_url: z.string().url().optional(),
    image_2_url: z.string().url().optional(),
    image_3_url: z.string().url().optional(),
    imagem_capa_index: z.number().int().min(1).max(3).optional()
  })
});

export const getProdutosSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    categoria_id: z.string().uuid().optional(),
    categoria: z.string().optional(), // Mantido para compatibilidade
    ativo: z.string().transform(val => val === 'true').optional(),
    comEstoqueLocalId: z.string().uuid().optional()
  })
});

// Estoque - Movimentos
export const entradaEstoqueSchema = z.object({
  body: z.object({
    produto_id: z.string().uuid(),
    quantidade: z.number().int().positive(),
    estoque_local_destino_id: z.string().uuid(),
    observacao: z.string().optional()
  })
});

export const saidaEstoqueSchema = z.object({
  body: z.object({
    produto_id: z.string().uuid(),
    quantidade: z.number().int().positive(),
    estoque_local_origem_id: z.string().uuid(),
    observacao: z.string().optional()
  })
});

export const transferenciaEstoqueSchema = z.object({
  body: z.object({
    produto_id: z.string().uuid(),
    quantidade: z.number().int().positive(),
    origem_id: z.string().uuid(),
    destino_id: z.string().uuid(),
    observacao: z.string().optional()
  })
});

export const ajusteEstoqueSchema = z.object({
  body: z.object({
    produto_id: z.string().uuid(),
    quantidade_nova: z.number().int().min(0),
    estoque_local_id: z.string().uuid(),
    motivo: z.string().min(1)
  })
});

// Solicitações
export const createSolicitacaoSchema = z.object({
  body: z.object({
    loja_id: z.string().uuid(),
    objetivo: z.string().optional(),
    observacoes: z.string().optional(),
    referencias: z.array(z.string()).optional(), // Array de base64 strings ou URLs
    itens: z.array(z.object({
      produto_id: z.string().uuid(),
      quantidade_solicitada: z.number().int().positive(),
      observacao_item: z.string().optional()
    })).min(1)
  })
});

export const updateSolicitacaoSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    objetivo: z.string().optional(),
    observacoes: z.string().optional(),
    referencias: z.array(z.string()).optional(),
    ativo: z.boolean().optional()
  })
});

export const changeStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    status_novo: z.enum([
      'solicitacao',
      'cotacao',
      'aguardando_oc',
      'em_producao',
      'pronto_para_retirar',
      'enviado_para_loja',
      'aplicado',
      'cancelado'
    ]),
    motivo: z.string().optional()
  })
});

export const addItemSolicitacaoSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    produto_id: z.string().uuid(),
    quantidade_solicitada: z.number().int().positive(),
    observacao_item: z.string().optional()
  })
});

export const updateItemSolicitacaoSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    item_id: z.string().uuid()
  }),
  body: z.object({
    quantidade_solicitada: z.number().int().positive().optional(),
    quantidade_aprovada: z.number().int().min(0).optional(),
    observacao_item: z.string().optional()
  })
});

export const confirmarRetiradaSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    imagem_url: z.string().url().optional(),
    assinatura_url: z.string().url().optional(),
    observacao: z.string().optional()
  })
});

export const confirmarEnvioSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    tracking_code: z.string().optional(),
    imagem_url: z.string().url().optional(),
    observacao: z.string().optional()
  })
});

export const confirmarAplicacaoSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    imagem_url: z.string().url().optional(),
    observacao: z.string().optional()
  })
});

// Categorias
export const createCategoriaSchema = z.object({
  body: z.object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    descricao: z.string().optional(),
    ativo: z.boolean().default(true)
  })
});

export const updateCategoriaSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    nome: z.string().min(1).optional(),
    descricao: z.string().optional(),
    ativo: z.boolean().optional()
  })
});

export const getCategoriasSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    ativo: z.string().transform(val => val === 'true').optional()
  })
});

// Vendas Online
export const createVendaOnlineSchema = z.object({
  body: z.object({
    data_pedido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
    hora_pedido: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM'),
    loja_id: z.string().uuid('Loja ID deve ser um UUID válido'),
    marca_bateria: z.string().min(1, 'Marca da bateria é obrigatória'),
    amperage: z.number().int().positive('Amperagem deve ser um número positivo'),
    status: z.enum(['ENTREGUE', 'RETIRADA', 'RETIR.PEND', 'CANCELADA']).default('ENTREGUE'),
    hora_programada: z.string().regex(/^\d{2}:\d{2}$/, 'Hora programada deve estar no formato HH:MM').optional().nullable(),
    observacao: z.string().optional().nullable(),
    valor: z.number().nonnegative('Valor deve ser um número não negativo').optional().nullable(),
    tipo_venda: z.enum(['CRM', 'Marketplace'], { errorMap: () => ({ message: 'Tipo de venda deve ser CRM ou Marketplace' }) })
  })
});

export const updateVendaOnlineSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    data_pedido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional(),
    hora_pedido: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM').optional(),
    loja_id: z.string().uuid('Loja ID deve ser um UUID válido').optional(),
    marca_bateria: z.string().min(1, 'Marca da bateria é obrigatória').optional(),
    amperage: z.number().int().positive('Amperagem deve ser um número positivo').optional(),
    status: z.enum(['ENTREGUE', 'RETIRADA', 'RETIR.PEND', 'CANCELADA']).optional(),
    hora_programada: z.string().regex(/^\d{2}:\d{2}$/, 'Hora programada deve estar no formato HH:MM').optional().nullable(),
    observacao: z.string().optional().nullable(),
    valor: z.number().nonnegative('Valor deve ser um número não negativo').optional().nullable(),
    tipo_venda: z.enum(['CRM', 'Marketplace']).optional()
  })
});

export const getVendasOnlineSchema = z.object({
  query: z.object({
    status: z.enum(['ENTREGUE', 'RETIRADA', 'RETIR.PEND', 'CANCELADA']).optional(),
    loja_id: z.string().uuid().optional(),
    tipo_venda: z.enum(['CRM', 'Marketplace']).optional(),
    data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    data_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    search: z.string().optional()
  })
});