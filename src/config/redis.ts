// src/config/redis.ts
import Redis from "ioredis";
import { config } from "./index";
import { logger } from "../utils/logger";

class RedisConfig {
  private static instance: Redis;

  public static getInstance(): Redis {
    if (!RedisConfig.instance) {
      RedisConfig.instance = new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || "0"),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      RedisConfig.instance.on("connect", () => {
        logger.info("✅ Conexión a Redis establecida correctamente");
      });

      RedisConfig.instance.on("error", (error) => {
        logger.error("❌ Error de conexión a Redis:", error);
      });

      RedisConfig.instance.on("ready", () => {
        logger.info("🚀 Redis listo para usar");
      });
    }

    return RedisConfig.instance;
  }

  public static async testConnection(): Promise<boolean> {
    try {
      const redis = RedisConfig.getInstance();
      await redis.ping();
      return true;
    } catch (error) {
      logger.error("Error probando conexión Redis:", error);
      return false;
    }
  }

  public static async disconnect(): Promise<void> {
    if (RedisConfig.instance) {
      await RedisConfig.instance.quit();
      logger.info("Redis desconectado");
    }
  }
}

export { RedisConfig };
export const redis = RedisConfig.getInstance();
