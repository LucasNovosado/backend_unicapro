import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middleware/validation';

// Carregar variáveis de ambiente primeiro
dotenv.config();

// Verificar variáveis de ambiente críticas antes de iniciar
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERRO: Variáveis de ambiente obrigatórias não encontradas:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\n💡 Certifique-se de que todas as variáveis estão configuradas no Easypanel.');
  process.exit(1);
}

const app: Express = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS Configuration - Permite todas as origens para facilitar desenvolvimento
// Em produção, você pode restringir isso adicionando uma lista de origens permitidas
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // SEMPRE permite requisições (temporário para debug - ajuste em produção se necessário)
    // Isso resolve o problema de CORS enquanto você desenvolve
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Auth-Token'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400, // Cache preflight por 24 horas
};

// Middlewares - CORS deve ser o primeiro
app.use(cors(corsOptions));

// Handler explícito para requisições OPTIONS (preflight) - deve vir antes das rotas
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Auth-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger configuration
const getServerUrl = () => {
  // Se tiver variável de ambiente com a URL do servidor, usa ela
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL;
  }
  // Se estiver em produção, tenta construir a URL do Easypanel
  if (process.env.NODE_ENV === 'production') {
    // Easypanel geralmente usa variáveis de ambiente como EASYPANEL_SERVICE_URL
    // ou você pode definir SERVER_URL manualmente
    return process.env.EASYPANEL_SERVICE_URL || `https://sites-backend-unicapro.ftqqwv.easypanel.host`;
  }
  // Em desenvolvimento, usa localhost
  return `http://localhost:${PORT}`;
};

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Estoque - Módulo de Estoque/Solicitações',
      version: '1.0.0',
      description: 'API REST completa para gerenciamento de estoque e solicitações de materiais de marketing',
    },
    servers: [
      {
        url: getServerUrl(),
        description: process.env.NODE_ENV === 'production' ? 'Servidor de produção' : 'Servidor de desenvolvimento',
      },
      // Adiciona servidor de desenvolvimento se estiver em produção (para referência)
      ...(process.env.NODE_ENV === 'production' ? [{
        url: `http://localhost:${PORT}`,
        description: 'Servidor local (desenvolvimento)',
      }] : []),
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use(`/api/${process.env.API_VERSION || 'v1'}`, routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint for debugging
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Estoque - Backend está funcionando!',
    version: process.env.API_VERSION || 'v1',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      apiDocs: '/api-docs',
      apiBase: `/api/${process.env.API_VERSION || 'v1'}`,
      lojas: `/api/${process.env.API_VERSION || 'v1'}/lojas (requer autenticação)`
    }
  });
});

// Error handler
app.use(errorHandler);

// Tratamento de erros não capturados
process.on('uncaughtException', (error: Error) => {
  console.error('❌ ERRO NÃO CAPTURADO:', error);
  console.error('Stack:', error.stack);
  // Não encerrar o processo imediatamente em produção, mas registrar o erro
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ PROMISE REJEITADA NÃO TRATADA:', reason);
  console.error('Promise:', promise);
});

// Start server
// Em produção (Docker/containers), precisa escutar em 0.0.0.0 para aceitar conexões externas
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

try {
  // Tentar importar o Supabase para verificar se há erros na inicialização
  import('./config/supabase').then(() => {
    console.log('✅ Supabase configurado com sucesso');
  }).catch((error) => {
    console.error('❌ ERRO ao inicializar Supabase:', error);
    console.error('Stack:', error.stack);
  });

  app.listen(PORT, HOST, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📚 Swagger docs available at http://${HOST}:${PORT}/api-docs`);
    console.log(`🔍 Health check: http://${HOST}:${PORT}/health`);
    console.log(`📍 API Base: http://${HOST}:${PORT}/api/${process.env.API_VERSION || 'v1'}`);
    console.log(`🏪 Lojas endpoint: http://${HOST}:${PORT}/api/${process.env.API_VERSION || 'v1'}/lojas`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 Supabase URL: ${process.env.SUPABASE_URL ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`📦 Port: ${PORT}`);
    console.log(`🌐 Host: ${HOST}`);
    console.log('='.repeat(60));
  }).on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ ERRO: Porta ${PORT} já está em uso!`);
      console.error('💡 Tente usar uma porta diferente ou pare o processo que está usando esta porta.');
    } else {
      console.error('❌ ERRO ao iniciar servidor:', error);
    }
    process.exit(1);
  });
} catch (error: any) {
  console.error('❌ ERRO FATAL ao iniciar aplicação:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}

export default app;
