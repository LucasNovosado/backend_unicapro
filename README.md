# Backend - API Estoque

## Instruções para rodar

1. Instalar dependências:
```bash
npm install
```

2. Configurar variáveis de ambiente:
Copiar `.env.example` para `.env` e preencher:
```
SUPABASE_URL=sua_url_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
SUPABASE_ANON_KEY=sua_anon_key
PORT=3000
NODE_ENV=development
API_VERSION=v1
```

3. Rodar em desenvolvimento:
```bash
npm run dev
```

4. Build para produção:
```bash
npm run build
npm start
```

5. Acessar:
- API: http://localhost:3000
- Swagger Docs: http://localhost:3000/api-docs
- Health Check: http://localhost:3000/health

## Estrutura do Projeto

```
backend/
├── src/
│   ├── config/          # Configurações (Supabase)
│   ├── controllers/     # Controllers dos endpoints
│   ├── middleware/      # Middlewares (auth, validation)
│   ├── routes/          # Rotas da API
│   ├── schemas/         # Schemas de validação (Zod)
│   └── index.ts         # Arquivo principal
├── package.json
└── tsconfig.json
```

## Endpoints Principais

### Auth / Usuários
- `GET /api/v1/me` - Dados do usuário logado
- `GET /api/v1/lojas` - Listar lojas (filtrado por perfil)
- `GET /api/v1/estoques/locais` - Listar estoques locais

### Produtos
- `GET /api/v1/produtos` - Listar produtos
- `GET /api/v1/produtos/:id` - Detalhes do produto
- `POST /api/v1/produtos` - Criar produto (admin)
- `PUT /api/v1/produtos/:id` - Atualizar produto (admin)
- `DELETE /api/v1/produtos/:id` - Desativar produto (admin)

### Estoque
- `GET /api/v1/estoque/saldos` - Listar saldos
- `GET /api/v1/estoque/movimentos` - Listar movimentos
- `POST /api/v1/estoque/entrada` - Entrada de estoque (admin)
- `POST /api/v1/estoque/saida` - Saída de estoque (admin)
- `POST /api/v1/estoque/transferencia` - Transferência (admin)
- `POST /api/v1/estoque/ajuste` - Ajuste de estoque (admin)

### Solicitações
- `GET /api/v1/solicitacoes` - Listar solicitações
- `GET /api/v1/solicitacoes/:id` - Detalhes da solicitação
- `POST /api/v1/solicitacoes` - Criar solicitação
- `PUT /api/v1/solicitacoes/:id` - Atualizar solicitação
- `POST /api/v1/solicitacoes/:id/status` - Alterar status
- `POST /api/v1/solicitacoes/:id/aprovar-oc` - Aprovar OC (admin)
- `POST /api/v1/solicitacoes/:id/reprovar-oc` - Reprovar OC (admin)
- `POST /api/v1/solicitacoes/:id/confirmar-retirada` - Confirmar retirada
- `POST /api/v1/solicitacoes/:id/confirmar-envio` - Confirmar envio (admin)
- `POST /api/v1/solicitacoes/:id/confirmar-aplicacao` - Confirmar aplicação
- `GET /api/v1/solicitacoes/:id/logs` - Logs de status

### Alertas
- `GET /api/v1/alertas` - Alertas (pronto para retirar)

## Autenticação

Todas as rotas (exceto health check) requerem autenticação via Bearer Token no header:
```
Authorization: Bearer <token>
```

## Permissões

- **Diretor**: Acesso total a todas as rotas
- **Supervisor**: Acesso limitado às lojas vinculadas
