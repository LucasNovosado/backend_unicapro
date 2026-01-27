# Documentação da API - Frontend

## URL Base da API

```
https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1
```

## Configuração no Frontend

### Exemplo com JavaScript/TypeScript

```javascript
// config/api.js ou config/api.ts
export const API_BASE_URL = 'https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1';

// Ou usando variável de ambiente
export const API_BASE_URL = process.env.REACT_APP_API_URL || 
  'https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1';
```

### Exemplo com Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken'); // ou onde você armazena o token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

### Exemplo com Fetch API

```javascript
const API_BASE_URL = 'https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}
```

---

## Endpoints Disponíveis

### 🔐 Autenticação

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "usuario@example.com"
  }
}
```

#### Logout
```http
POST /api/v1/auth/logout
Authorization: Bearer {token}
```

#### Obter dados do usuário logado
```http
GET /api/v1/me
Authorization: Bearer {token}
```

---

### 🏪 Lojas

#### Listar lojas
```http
GET /api/v1/lojas
Authorization: Bearer {token}
```

**Resposta:**
```json
[
  {
    "id": "uuid",
    "nome": "Loja Centro",
    "codigo": "001",
    "ativo": true
  }
]
```

---

### 📦 Produtos

#### Listar produtos
```http
GET /api/v1/produtos?categoria_id={id}&search={termo}&page={pagina}&limit={limite}
Authorization: Bearer {token}
```

#### Obter produto por ID
```http
GET /api/v1/produtos/{id}
Authorization: Bearer {token}
```

#### Criar produto (Admin)
```http
POST /api/v1/produtos
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Produto Exemplo",
  "descricao": "Descrição do produto",
  "categoria_id": "uuid",
  "unidade_medida": "UN",
  "ativo": true
}
```

#### Atualizar produto (Admin)
```http
PUT /api/v1/produtos/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Produto Atualizado",
  "descricao": "Nova descrição"
}
```

#### Deletar produto (Admin)
```http
DELETE /api/v1/produtos/{id}
Authorization: Bearer {token}
```

---

### 📊 Estoque

#### Obter saldos de estoque
```http
GET /api/v1/estoque/saldos?loja_id={id}&produto_id={id}
Authorization: Bearer {token}
```

#### Obter movimentos de estoque
```http
GET /api/v1/estoque/movimentos?loja_id={id}&produto_id={id}&tipo={tipo}&data_inicio={data}&data_fim={data}
Authorization: Bearer {token}
```

#### Entrada de estoque (Admin)
```http
POST /api/v1/estoque/entrada
Authorization: Bearer {token}
Content-Type: application/json

{
  "produto_id": "uuid",
  "loja_id": "uuid",
  "quantidade": 100,
  "observacao": "Entrada inicial"
}
```

#### Saída de estoque (Admin)
```http
POST /api/v1/estoque/saida
Authorization: Bearer {token}
Content-Type: application/json

{
  "produto_id": "uuid",
  "loja_id": "uuid",
  "quantidade": 10,
  "observacao": "Saída para uso"
}
```

#### Transferência entre lojas (Admin)
```http
POST /api/v1/estoque/transferencia
Authorization: Bearer {token}
Content-Type: application/json

{
  "produto_id": "uuid",
  "loja_origem_id": "uuid",
  "loja_destino_id": "uuid",
  "quantidade": 50,
  "observacao": "Transferência"
}
```

#### Ajuste de estoque (Admin)
```http
POST /api/v1/estoque/ajuste
Authorization: Bearer {token}
Content-Type: application/json

{
  "produto_id": "uuid",
  "loja_id": "uuid",
  "quantidade_nova": 200,
  "observacao": "Ajuste de inventário"
}
```

---

### 📋 Solicitações

#### Listar solicitações
```http
GET /api/v1/solicitacoes?loja_id={id}&status={status}&page={pagina}&limit={limite}
Authorization: Bearer {token}
```

#### Obter solicitação por ID
```http
GET /api/v1/solicitacoes/{id}
Authorization: Bearer {token}
```

#### Criar solicitação
```http
POST /api/v1/solicitacoes
Authorization: Bearer {token}
Content-Type: application/json

{
  "loja_id": "uuid",
  "observacao": "Solicitação de materiais",
  "itens": [
    {
      "produto_id": "uuid",
      "quantidade_solicitada": 10,
      "observacao": "Item necessário"
    }
  ]
}
```

#### Atualizar solicitação
```http
PUT /api/v1/solicitacoes/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "observacao": "Observação atualizada"
}
```

#### Adicionar item à solicitação
```http
POST /api/v1/solicitacoes/{id}/itens
Authorization: Bearer {token}
Content-Type: application/json

{
  "produto_id": "uuid",
  "quantidade_solicitada": 5,
  "observacao": "Novo item"
}
```

#### Atualizar item da solicitação
```http
PUT /api/v1/solicitacoes/{id}/itens/{item_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "quantidade_solicitada": 8
}
```

#### Deletar item da solicitação
```http
DELETE /api/v1/solicitacoes/{id}/itens/{item_id}
Authorization: Bearer {token}
```

#### Alterar status da solicitação
```http
POST /api/v1/solicitacoes/{id}/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "aprovada",
  "observacao": "Aprovada para envio"
}
```

#### Aprovar OC (Admin)
```http
POST /api/v1/solicitacoes/{id}/aprovar-oc
Authorization: Bearer {token}
```

#### Reprovar OC (Admin)
```http
POST /api/v1/solicitacoes/{id}/reprovar-oc
Authorization: Bearer {token}
Content-Type: application/json

{
  "motivo": "Motivo da reprovação"
}
```

#### Confirmar retirada
```http
POST /api/v1/solicitacoes/{id}/confirmar-retirada
Authorization: Bearer {token}
Content-Type: application/json

{
  "comprovante_url": "https://exemplo.com/comprovante.jpg"
}
```

#### Confirmar envio (Admin)
```http
POST /api/v1/solicitacoes/{id}/confirmar-envio
Authorization: Bearer {token}
Content-Type: application/json

{
  "comprovante_url": "https://exemplo.com/comprovante.jpg",
  "observacao": "Enviado via transportadora"
}
```

#### Confirmar aplicação
```http
POST /api/v1/solicitacoes/{id}/confirmar-aplicacao
Authorization: Bearer {token}
Content-Type: application/json

{
  "comprovante_url": "https://exemplo.com/comprovante.jpg",
  "observacao": "Aplicado com sucesso"
}
```

#### Obter logs da solicitação
```http
GET /api/v1/solicitacoes/{id}/logs
Authorization: Bearer {token}
```

---

### 🏷️ Categorias

#### Listar categorias
```http
GET /api/v1/categorias?search={termo}&page={pagina}&limit={limite}
Authorization: Bearer {token}
```

#### Obter categoria por ID
```http
GET /api/v1/categorias/{id}
Authorization: Bearer {token}
```

#### Criar categoria (Admin)
```http
POST /api/v1/categorias
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Categoria Exemplo",
  "descricao": "Descrição da categoria",
  "ativo": true
}
```

#### Atualizar categoria (Admin)
```http
PUT /api/v1/categorias/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "nome": "Categoria Atualizada"
}
```

#### Deletar categoria (Admin)
```http
DELETE /api/v1/categorias/{id}
Authorization: Bearer {token}
```

---

### 🔔 Alertas

#### Obter alertas
```http
GET /api/v1/alertas?loja_id={id}&tipo={tipo}
Authorization: Bearer {token}
```

---

### 📍 Estoques Locais

#### Obter locais de estoque
```http
GET /api/v1/estoques/locais
Authorization: Bearer {token}
```

---

## Endpoints Públicos (Sem Autenticação)

### Health Check
```http
GET https://sites-backend-unicapro.ftqqwv.easypanel.host/health
```

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-25T23:45:08.309Z",
  "uptime": 1234.56,
  "environment": "production",
  "port": 3000,
  "host": "0.0.0.0",
  "supabase": {
    "url": "✅ Configurado",
    "serviceKey": "✅ Configurado",
    "anonKey": "✅ Configurado"
  }
}
```

### Informações da API
```http
GET https://sites-backend-unicapro.ftqqwv.easypanel.host/
```

**Resposta:**
```json
{
  "message": "API Estoque - Backend está funcionando!",
  "version": "v1",
  "environment": "production",
  "timestamp": "2026-01-25T23:46:17.618Z",
  "endpoints": {
    "health": "/health",
    "apiDocs": "/api-docs",
    "apiBase": "/api/v1",
    "lojas": "/api/v1/lojas (requer autenticação)"
  }
}
```

### Documentação Swagger
```http
GET https://sites-backend-unicapro.ftqqwv.easypanel.host/api-docs
```

---

## Autenticação

Todos os endpoints (exceto `/health`, `/` e `/api-docs`) requerem autenticação via Bearer Token.

### Como obter o token:

1. Faça login em `/api/v1/auth/login`
2. Armazene o token retornado
3. Inclua o token em todas as requisições:

```http
Authorization: Bearer {seu_token_aqui}
```

### Exemplo de fluxo de autenticação:

```javascript
// 1. Login
const loginResponse = await fetch('https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'usuario@example.com',
    password: 'senha123'
  })
});

const { token, user } = await loginResponse.json();

// 2. Armazenar token
localStorage.setItem('authToken', token);

// 3. Usar token nas próximas requisições
const lojasResponse = await fetch('https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1/lojas', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

## Códigos de Status HTTP

- `200` - Sucesso
- `201` - Criado com sucesso
- `204` - Sucesso sem conteúdo
- `400` - Requisição inválida
- `401` - Não autenticado (token inválido ou ausente)
- `403` - Acesso negado (sem permissão)
- `404` - Recurso não encontrado
- `500` - Erro interno do servidor

---

## Tratamento de Erros

Todas as respostas de erro seguem o formato:

```json
{
  "error": "Mensagem de erro descritiva"
}
```

### Exemplo de tratamento:

```javascript
try {
  const response = await fetch(`${API_BASE_URL}/lojas`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro na requisição');
  }
  
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Erro ao buscar lojas:', error);
  throw error;
}
```

---

## Variáveis de Ambiente Recomendadas

Para facilitar a configuração em diferentes ambientes (desenvolvimento, produção), use variáveis de ambiente:

```env
# .env.development
REACT_APP_API_URL=http://localhost:3000/api/v1

# .env.production
REACT_APP_API_URL=https://sites-backend-unicapro.ftqqwv.easypanel.host/api/v1
```

---

## Notas Importantes

1. ✅ **CORS está configurado** - O backend aceita requisições de qualquer origem
2. ✅ **HTTPS habilitado** - Todas as requisições devem usar HTTPS em produção
3. ✅ **Token JWT** - O token expira após um período (verifique a configuração do Supabase)
4. ⚠️ **Permissões** - Alguns endpoints requerem permissão de Admin (`requireAdmin`)
5. 📝 **Content-Type** - Sempre use `application/json` para requisições POST/PUT

---

## Suporte

Para mais informações, acesse a documentação Swagger:
```
https://sites-backend-unicapro.ftqqwv.easypanel.host/api-docs
```
