import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import env from "./config/environment";
import { testConnection } from "./config/database";
import configureSocketServer from "./config/socket";
import logger from "./utils/logger";
import errorMiddleware from "./middlewares/error.middleware";
import authRoutes from "./routes/auth.routes";

// Crear aplicación Express
const app = express();

// Configuración de middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas API
app.use("/api/auth", authRoutes);

// Middleware de manejo de errores
// app.use(errorMiddleware);

// Crear servidor HTTP
const server = http.createServer(app);

// Configurar servidor WebSocket
const io = configureSocketServer(server);

// Iniciar servidor
const startServer = async (): Promise<void> => {
  try {
    // Probar conexión a la base de datos
    await testConnection();

    // Iniciar servidor HTTP
    server.listen(env.PORT, () => {
      logger.info(
        `Servidor iniciado en el puerto ${env.PORT} (${env.NODE_ENV})`
      );
    });
  } catch (error) {
    logger.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();

export { app, server, io };
