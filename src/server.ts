// src/server.ts
import app from "./app";
import { config } from "./config";
import { logger } from "./utils/logger";
import { testSupabaseConnection } from "./config/supabase";

const startServer = async () => {
  try {
    // Verificar conexión a Supabase
    const supabaseConnected = await testSupabaseConnection();
    if (!supabaseConnected) {
      logger.warn(
        "No se pudo conectar a Supabase, continuando sin base de datos"
      );
    } else {
      logger.info("Conexión a Supabase establecida correctamente");
    }

    // Iniciar servidor
    const server = app.listen(config.port, () => {
      logger.info(
        `🚀 Servidor SELK Warehouse API ejecutándose en puerto ${config.port}`
      );
      logger.info(`📱 Ambiente: ${config.nodeEnv}`);
      logger.info(`🔗 URL: http://localhost:${config.port}`);
      logger.info(`🏥 Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      logger.info("SIGTERM recibido, cerrando servidor...");
      server.close(() => {
        logger.info("Servidor cerrado correctamente");
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();
