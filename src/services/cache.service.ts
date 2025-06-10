// src/services/colocacion/cache.service.ts
import { redis } from "../config/redis";
import { logger } from "../utils/logger";
import Product from "../models/Product";

interface CacheStats {
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
}

export class CacheService {
  private static readonly CACHE_PREFIX = "colocacion:product:";
  private static readonly CACHE_TTL = 300; // 5 minutos
  private static readonly FREQUENT_CACHE_TTL = 1800; // 30 minutos para productos frecuentes
  private static readonly STATS_KEY = "colocacion:cache:stats";
  private static readonly FREQUENT_KEY_PREFIX = "colocacion:frequent:";

  /**
   * Obtener producto desde cache
   */
  public static async getProduct(barcode: string): Promise<Product | null> {
    try {
      const cacheKey = this.CACHE_PREFIX + barcode;
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        await this.incrementCacheHit();
        const productData = JSON.parse(cachedData);

        // Crear instancia de Product desde datos cacheados
        const product = Product.build(productData);

        // Marcar producto como frecuente si no lo está
        await this.markAsFrequent(barcode);

        logger.debug(`Producto encontrado en cache: ${barcode}`);
        return product;
      }

      await this.incrementCacheMiss();
      return null;
    } catch (error) {
      logger.error(`Error obteniendo producto del cache: ${barcode}`, error);
      await this.incrementCacheMiss();
      return null;
    }
  }

  /**
   * Guardar producto en cache
   */
  public static async setProduct(
    product: Product,
    isFrequent: boolean = false
  ): Promise<void> {
    try {
      const cacheKey = this.CACHE_PREFIX + product.barcode;
      const ttl = isFrequent ? this.FREQUENT_CACHE_TTL : this.CACHE_TTL;

      const productData = {
        id: product.id,
        barcode: product.barcode,
        reference: product.reference,
        description: product.description,
        location: product.location,
        stock: product.stock,
        status: product.status,
        odoo_product_id: product.odoo_product_id,
        created_at: product.created_at,
        updated_at: product.updated_at,
        last_odoo_sync: product.last_odoo_sync,
      };

      await redis.setex(cacheKey, ttl, JSON.stringify(productData));

      if (isFrequent) {
        await this.markAsFrequent(product.barcode);
      }

      logger.debug(
        `Producto guardado en cache: ${product.barcode} (TTL: ${ttl}s)`
      );
    } catch (error) {
      logger.error(
        `Error guardando producto en cache: ${product.barcode}`,
        error
      );
    }
  }

  /**
   * Invalidar producto del cache
   */
  public static async invalidateProduct(barcode: string): Promise<void> {
    try {
      const cacheKey = this.CACHE_PREFIX + barcode;
      await redis.del(cacheKey);
      logger.debug(`Cache invalidado para producto: ${barcode}`);
    } catch (error) {
      logger.error(`Error invalidando cache para producto: ${barcode}`, error);
    }
  }

  /**
   * Marcar producto como frecuentemente consultado
   */
  private static async markAsFrequent(barcode: string): Promise<void> {
    try {
      const frequentKey = this.FREQUENT_KEY_PREFIX + barcode;
      const currentCount = await redis.incr(frequentKey);

      // Establecer TTL de 24 horas para el contador
      if (currentCount === 1) {
        await redis.expire(frequentKey, 86400);
      }

      // Si el producto se consulta más de 5 veces, marcarlo como frecuente
      if (currentCount >= 5) {
        const cacheKey = this.CACHE_PREFIX + barcode;
        const cachedData = await redis.get(cacheKey);

        if (cachedData) {
          // Extender TTL para productos frecuentes
          await redis.expire(cacheKey, this.FREQUENT_CACHE_TTL);
          logger.debug(`Producto marcado como frecuente: ${barcode}`);
        }
      }
    } catch (error) {
      logger.error(`Error marcando producto como frecuente: ${barcode}`, error);
    }
  }

  /**
   * Obtener productos frecuentemente consultados
   */
  public static async getFrequentProducts(
    limit: number = 20
  ): Promise<string[]> {
    try {
      const pattern = this.FREQUENT_KEY_PREFIX + "*";
      const keys = await redis.keys(pattern);

      const frequentProducts: Array<{ barcode: string; count: number }> = [];

      for (const key of keys) {
        const count = await redis.get(key);
        if (count && parseInt(count) >= 5) {
          const barcode = key.replace(this.FREQUENT_KEY_PREFIX, "");
          frequentProducts.push({ barcode, count: parseInt(count) });
        }
      }

      // Ordenar por frecuencia y retornar los códigos de barras
      return frequentProducts
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((item) => item.barcode);
    } catch (error) {
      logger.error("Error obteniendo productos frecuentes:", error);
      return [];
    }
  }

  /**
   * Incrementar contador de cache hits
   */
  private static async incrementCacheHit(): Promise<void> {
    try {
      await redis.hincrby(this.STATS_KEY, "hits", 1);
      await redis.hincrby(this.STATS_KEY, "total", 1);
    } catch (error) {
      logger.error("Error incrementando cache hit:", error);
    }
  }

  /**
   * Incrementar contador de cache misses
   */
  private static async incrementCacheMiss(): Promise<void> {
    try {
      await redis.hincrby(this.STATS_KEY, "misses", 1);
      await redis.hincrby(this.STATS_KEY, "total", 1);
    } catch (error) {
      logger.error("Error incrementando cache miss:", error);
    }
  }

  /**
   * Obtener estadísticas del cache
   */
  public static async getCacheStats(): Promise<CacheStats> {
    try {
      const stats = await redis.hmget(
        this.STATS_KEY,
        "hits",
        "misses",
        "total"
      );
      const hits = parseInt(stats[0] || "0");
      const misses = parseInt(stats[1] || "0");
      const total = parseInt(stats[2] || "0");

      return {
        hits,
        misses,
        total,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
      };
    } catch (error) {
      logger.error("Error obteniendo estadísticas del cache:", error);
      return { hits: 0, misses: 0, total: 0, hitRate: 0 };
    }
  }

  /**
   * Limpiar cache de productos
   */
  public static async clearProductCache(): Promise<void> {
    try {
      const pattern = this.CACHE_PREFIX + "*";
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`Cache limpiado: ${keys.length} productos eliminados`);
      }
    } catch (error) {
      logger.error("Error limpiando cache de productos:", error);
    }
  }

  /**
   * Resetear estadísticas del cache
   */
  public static async resetCacheStats(): Promise<void> {
    try {
      await redis.del(this.STATS_KEY);
      logger.info("Estadísticas del cache reseteadas");
    } catch (error) {
      logger.error("Error reseteando estadísticas del cache:", error);
    }
  }
}
