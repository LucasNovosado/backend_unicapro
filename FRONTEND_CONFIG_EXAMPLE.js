/**
 * Configuração da API para Frontend
 * 
 * Substitua todas as referências antigas da API por esta configuração
 */

// ============================================
// CONFIGURAÇÃO BASE
// ============================================

// URL Base da API em Produção
export const API_BASE_URL = 'https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1';

// URL Base para desenvolvimento (opcional)
export const API_BASE_URL_DEV = 'http://localhost:3000/api/v1';

// Selecionar URL baseada no ambiente
export const API_URL = process.env.NODE_ENV === 'production' 
  ? API_BASE_URL 
  : API_BASE_URL_DEV;

// ============================================
// EXEMPLO COM AXIOS
// ============================================

import axios from 'axios';

// Criar instância do Axios
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 segundos
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken'); // ou sessionStorage, ou seu gerenciador de estado
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido - redirecionar para login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// ============================================
// EXEMPLO DE USO COM AXIOS
// ============================================

// Login
export const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  const { token, user } = response.data;
  
  // Armazenar token
  localStorage.setItem('authToken', token);
  
  return { token, user };
};

// Obter lojas
export const getLojas = async () => {
  const response = await api.get('/lojas');
  return response.data;
};

// Obter produtos
export const getProdutos = async (params = {}) => {
  const response = await api.get('/produtos', { params });
  return response.data;
};

// Obter solicitações
export const getSolicitacoes = async (params = {}) => {
  const response = await api.get('/solicitacoes', { params });
  return response.data;
};

// Criar solicitação
export const createSolicitacao = async (data) => {
  const response = await api.post('/solicitacoes', data);
  return response.data;
};

// Obter estoque
export const getEstoque = async (params = {}) => {
  const response = await api.get('/estoque/saldos', { params });
  return response.data;
};

// ============================================
// EXEMPLO COM FETCH API
// ============================================

/**
 * Função helper para fazer requisições com Fetch
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('authToken');
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  };
  
  // Se tiver body, converter para JSON
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, config);
  
  // Verificar se a resposta é JSON
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  
  const data = isJson ? await response.json() : await response.text();
  
  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }
  
  return data;
};

// Exemplos de uso com Fetch
export const fetchLojas = () => apiRequest('/lojas');
export const fetchProdutos = (params) => {
  const queryString = new URLSearchParams(params).toString();
  return apiRequest(`/produtos?${queryString}`);
};

// ============================================
// CONSTANTES DE ENDPOINTS
// ============================================

export const ENDPOINTS = {
  // Autenticação
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/me',
  },
  
  // Lojas
  LOJAS: '/lojas',
  
  // Produtos
  PRODUTOS: '/produtos',
  PRODUTO_BY_ID: (id) => `/produtos/${id}`,
  
  // Estoque
  ESTOQUE_SALDOS: '/estoque/saldos',
  ESTOQUE_MOVIMENTOS: '/estoque/movimentos',
  ESTOQUE_ENTRADA: '/estoque/entrada',
  ESTOQUE_SAIDA: '/estoque/saida',
  ESTOQUE_TRANSFERENCIA: '/estoque/transferencia',
  ESTOQUE_AJUSTE: '/estoque/ajuste',
  
  // Solicitações
  SOLICITACOES: '/solicitacoes',
  SOLICITACAO_BY_ID: (id) => `/solicitacoes/${id}`,
  SOLICITACAO_ITENS: (id) => `/solicitacoes/${id}/itens`,
  SOLICITACAO_STATUS: (id) => `/solicitacoes/${id}/status`,
  SOLICITACAO_APROVAR_OC: (id) => `/solicitacoes/${id}/aprovar-oc`,
  SOLICITACAO_REPROVAR_OC: (id) => `/solicitacoes/${id}/reprovar-oc`,
  SOLICITACAO_CONFIRMAR_RETIRADA: (id) => `/solicitacoes/${id}/confirmar-retirada`,
  SOLICITACAO_CONFIRMAR_ENVIO: (id) => `/solicitacoes/${id}/confirmar-envio`,
  SOLICITACAO_CONFIRMAR_APLICACAO: (id) => `/solicitacoes/${id}/confirmar-aplicacao`,
  SOLICITACAO_LOGS: (id) => `/solicitacoes/${id}/logs`,
  
  // Categorias
  CATEGORIAS: '/categorias',
  CATEGORIA_BY_ID: (id) => `/categorias/${id}`,
  
  // Alertas
  ALERTAS: '/alertas',
  
  // Estoques Locais
  ESTOQUES_LOCAIS: '/estoques/locais',
};

// ============================================
// EXEMPLO DE USO COM CONSTANTES
// ============================================

// Usando as constantes
import { api, ENDPOINTS } from './config';

const lojas = await api.get(ENDPOINTS.LOJAS);
const produto = await api.get(ENDPOINTS.PRODUTO_BY_ID('123'));
const novaSolicitacao = await api.post(ENDPOINTS.SOLICITACOES, { ... });

// ============================================
// TIPOS TYPESCRIPT (se estiver usando TS)
// ============================================

/*
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    user_metadata?: any;
  };
}

export interface Loja {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  descricao?: string;
  categoria_id: string;
  unidade_medida: string;
  ativo: boolean;
}
*/
