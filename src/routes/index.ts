import { Router } from 'express';
import { authenticate, getUserRegra, requireAdmin, checkEstoqueLocalAccess } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as produtosController from '../controllers/produtos.controller';
import * as estoqueController from '../controllers/estoque.controller';
import * as solicitacoesController from '../controllers/solicitacoes.controller';
import * as authController from '../controllers/auth.controller';
import * as alertasController from '../controllers/alertas.controller';
import * as categoriasController from '../controllers/categorias.controller';
import * as vendasOnlineController from '../controllers/vendasOnline.controller';
import {
  loginSchema,
  createProdutoSchema,
  updateProdutoSchema,
  getProdutosSchema,
  entradaEstoqueSchema,
  saidaEstoqueSchema,
  transferenciaEstoqueSchema,
  ajusteEstoqueSchema,
  createSolicitacaoSchema,
  updateSolicitacaoSchema,
  changeStatusSchema,
  addItemSolicitacaoSchema,
  updateItemSolicitacaoSchema,
  confirmarRetiradaSchema,
  confirmarEnvioSchema,
  confirmarAplicacaoSchema,
  createCategoriaSchema,
  updateCategoriaSchema,
  getCategoriasSchema,
  createVendaOnlineSchema,
  updateVendaOnlineSchema,
  getVendasOnlineSchema
} from '../schemas/validation';

const router = Router();

// ============================================
// AUTH / USUÁRIOS (Público)
// ============================================
router.post('/auth/login', validate(loginSchema), authController.login);
router.post('/auth/logout', authenticate, authController.logout);

// ============================================
// AUTH / USUÁRIOS (Protegido)
// ============================================
router.get('/me', authenticate, getUserRegra, authController.getMe);
router.get('/lojas', authenticate, getUserRegra, authController.getLojas);
router.get('/estoques/locais', authenticate, getUserRegra, authController.getEstoquesLocais);

// ============================================
// PRODUTOS
// ============================================
router.get('/produtos', authenticate, getUserRegra, validate(getProdutosSchema), produtosController.getProdutos);
router.post('/produtos/create-during-solicitacao', authenticate, getUserRegra, validate(createProdutoSchema), produtosController.createProdutoDuringSolicitacao);
router.post('/produtos', authenticate, getUserRegra, requireAdmin, validate(createProdutoSchema), produtosController.createProduto);
router.get('/produtos/:id', authenticate, getUserRegra, produtosController.getProdutoById);
router.put('/produtos/:id', authenticate, getUserRegra, requireAdmin, validate(updateProdutoSchema), produtosController.updateProduto);
router.delete('/produtos/:id', authenticate, getUserRegra, requireAdmin, produtosController.deleteProduto);

// ============================================
// ESTOQUE (Saldos e Movimentos)
// ============================================
router.get('/estoque/saldos', authenticate, getUserRegra, estoqueController.getSaldos);
router.get('/estoque/movimentos', authenticate, getUserRegra, estoqueController.getMovimentos);
router.post('/estoque/entrada', authenticate, getUserRegra, checkEstoqueLocalAccess, validate(entradaEstoqueSchema), estoqueController.entradaEstoque);
router.post('/estoque/saida', authenticate, getUserRegra, checkEstoqueLocalAccess, validate(saidaEstoqueSchema), estoqueController.saidaEstoque);
router.post('/estoque/transferencia', authenticate, getUserRegra, checkEstoqueLocalAccess, validate(transferenciaEstoqueSchema), estoqueController.transferenciaEstoque);
router.post('/estoque/ajuste', authenticate, getUserRegra, checkEstoqueLocalAccess, validate(ajusteEstoqueSchema), estoqueController.ajusteEstoque);

// ============================================
// SOLICITAÇÕES
// ============================================
router.get('/solicitacoes', authenticate, getUserRegra, solicitacoesController.getSolicitacoes);
router.get('/solicitacoes/:id', authenticate, getUserRegra, solicitacoesController.getSolicitacaoById);
router.post('/solicitacoes', authenticate, getUserRegra, validate(createSolicitacaoSchema), solicitacoesController.createSolicitacao);
router.put('/solicitacoes/:id', authenticate, getUserRegra, validate(updateSolicitacaoSchema), solicitacoesController.updateSolicitacao);

// Itens de solicitação
router.post('/solicitacoes/:id/itens', authenticate, getUserRegra, validate(addItemSolicitacaoSchema), solicitacoesController.addItemSolicitacao);
router.put('/solicitacoes/:id/itens/:item_id', authenticate, getUserRegra, validate(updateItemSolicitacaoSchema), solicitacoesController.updateItemSolicitacao);
router.delete('/solicitacoes/:id/itens/:item_id', authenticate, getUserRegra, solicitacoesController.deleteItemSolicitacao);

// Status
router.post('/solicitacoes/:id/status', authenticate, getUserRegra, validate(changeStatusSchema), solicitacoesController.changeStatus);

// Aprovação OC
router.post('/solicitacoes/:id/aprovar-oc', authenticate, getUserRegra, requireAdmin, solicitacoesController.aprovarOC);
router.post('/solicitacoes/:id/reprovar-oc', authenticate, getUserRegra, requireAdmin, solicitacoesController.reprovarOC);

// Comprovantes
router.post('/solicitacoes/:id/confirmar-retirada', authenticate, getUserRegra, validate(confirmarRetiradaSchema), solicitacoesController.confirmarRetirada);
router.post('/solicitacoes/:id/confirmar-envio', authenticate, getUserRegra, requireAdmin, validate(confirmarEnvioSchema), solicitacoesController.confirmarEnvio);
router.post('/solicitacoes/:id/confirmar-aplicacao', authenticate, getUserRegra, validate(confirmarAplicacaoSchema), solicitacoesController.confirmarAplicacao);

// Logs
router.get('/solicitacoes/:id/logs', authenticate, getUserRegra, solicitacoesController.getLogs);

// ============================================
// ALERTAS
// ============================================
router.get('/alertas', authenticate, getUserRegra, alertasController.getAlertas);

// ============================================
// CATEGORIAS
// ============================================
router.get('/categorias', authenticate, getUserRegra, validate(getCategoriasSchema), categoriasController.getCategorias);
router.get('/categorias/:id', authenticate, getUserRegra, categoriasController.getCategoriaById);
router.post('/categorias', authenticate, getUserRegra, requireAdmin, validate(createCategoriaSchema), categoriasController.createCategoria);
router.put('/categorias/:id', authenticate, getUserRegra, requireAdmin, validate(updateCategoriaSchema), categoriasController.updateCategoria);
router.delete('/categorias/:id', authenticate, getUserRegra, requireAdmin, categoriasController.deleteCategoria);

// ============================================
// VENDAS ONLINE
// ============================================
router.get('/vendas-online', authenticate, getUserRegra, validate(getVendasOnlineSchema), vendasOnlineController.getVendas);
router.get('/vendas-online/resumo', authenticate, getUserRegra, vendasOnlineController.getResumoVendas);
router.get('/vendas-online/:id', authenticate, getUserRegra, vendasOnlineController.getVendaById);
router.post('/vendas-online', authenticate, getUserRegra, validate(createVendaOnlineSchema), vendasOnlineController.createVenda);
router.put('/vendas-online/:id', authenticate, getUserRegra, validate(updateVendaOnlineSchema), vendasOnlineController.updateVenda);
router.delete('/vendas-online/:id', authenticate, getUserRegra, vendasOnlineController.deleteVenda);

export default router;
