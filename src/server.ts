// src/server.ts (actualizar)
import app from "./app";
import { config } from "./config/index";
import { logger } from "./utils/logger";
import { testSupabaseConnection } from "./config/supabase";
import { setupScheduledTasks } from "./utils/scheduler";

const startServer = async () => {
  try {
    // Verificar conexión a Supabase
    const supabaseConnected = await testSupabaseConnection();
    if (!supabaseConnected) {
      logger.warn(
        "No se pudo conectar a Supabase, continuando sin base de datos"
      );
    } else {
      logger.info("✅ Conexión a Supabase establecida correctamente");
    }

    // Configurar tareas programadas
    setupScheduledTasks();
    logger.info("✅ Tareas programadas configuradas");

    // Iniciar servidor
    const server = app.listen(config.port, () => {
      logger.info("🚀 ============================================");
      logger.info("🏭 SELK WAREHOUSE API INICIADO EXITOSAMENTE");
      logger.info("🚀 ============================================");
      logger.info(`📱 Ambiente: ${config.nodeEnv}`);
      logger.info(`🔗 URL: http://localhost:${config.port}`);
      logger.info(`🏥 Health: http://localhost:${config.port}/health`);
      logger.info(
        `🔐 Auth: http://localhost:${config.port}/api/${config.apiVersion}/auth`
      );
      logger.info("============================================");
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} recibido, cerrando servidor...`);
      server.close(() => {
        logger.info("Servidor cerrado correctamente");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error("❌ Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();
