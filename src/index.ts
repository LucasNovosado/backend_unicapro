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

// CORS Configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Lista de origens permitidas
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://localhost:5173',
      // Adicione aqui o domínio de produção do frontend quando disponível
      process.env.FRONTEND_URL,
    ].filter(Boolean); // Remove valores undefined/null

    // Permite requisições sem origin (ex: Postman, curl, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // Permite requisições de origens na lista
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Permite localhost em qualquer ambiente (útil para desenvolvimento local acessando produção)
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        callback(null, true);
      } else if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.NODE_ENV === '') {
        // Em desenvolvimento, permite qualquer origem
        callback(null, true);
      } else {
        console.warn(`CORS bloqueado para origem: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Middlewares
app.use(cors(corsOptions));
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
