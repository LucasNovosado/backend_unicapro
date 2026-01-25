import express, { Express } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middleware/validation';

dotenv.config();

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

// Handler explícito para requisições OPTIONS (preflight)
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger configuration
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
        url: `http://localhost:${PORT}`,
        description: 'Servidor de desenvolvimento',
      },
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

// Error handler
app.use(errorHandler);

// Start server
// Em produção (Docker/containers), precisa escutar em 0.0.0.0 para aceitar conexões externas
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📚 Swagger docs available at http://${HOST}:${PORT}/api-docs`);
});

export default app;
