// src/services/colocacion/sync.service.ts
import { Op } from "sequelize";
import Product from "../models/Product";
import { OdooConnectorService } from "./odoo-connector.service";
import { CacheService } from "./cache.service";
import { redis } from "../config/redis";
import { logger } from "../utils/logger";
import { auditLogger } from "../utils/audit-logger";

interface SyncResult {
  success: boolean;
  productsProcessed: number;
  productsUpdated: number;
  productsFailed: number;
  errors: string[];
  duration: number;
}

interface ConflictResolution {
  strategy: "odoo_wins" | "local_wins" | "manual" | "timestamp";
  userId?: string;
  deviceId?: string;
}

interface SyncConflict {
  productId: string;
  field: string;
  localValue: any;
  odooValue: any;
  localTimestamp: Date;
  odooTimestamp: Date;
  resolution?: "pending" | "resolved";
}

interface SyncQueueItem {
  id: string;
  type: "product_update" | "location_update" | "stock_update";
  productId: string;
  odooProductId: number;
  data: any;
  userId: string;
  deviceId: string;
  priority: "low" | "normal" | "high";
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
}

export class SyncService {
  private odooConnector: OdooConnectorService;
  private static readonly SYNC_QUEUE_KEY = "sync_queue";
  private static readonly SYNC_CONFLICTS_KEY = "sync_conflicts";
  private static readonly SYNC_STATS_KEY = "sync_stats";
  private static readonly SYNC_LOCK_KEY = "sync_lock";
  private static readonly MAX_RETRIES = 3;
  private static readonly SYNC_TIMEOUT = 30000; // 30 segundos

  constructor() {
    this.odooConnector = new OdooConnectorService();
  }

  /**
   * Sincronizar producto específico con Odoo
   */
  public async syncProduct(
    productId: string,
    userId: string,
    conflictResolution: ConflictResolution = { strategy: "timestamp" }
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      productsProcessed: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Obtener producto local
      const localProduct = await Product.findByPk(productId);
      if (!localProduct) {
        result.errors.push("Producto no encontrado localmente");
        result.duration = Date.now() - startTime;
        return result;
      }

      result.productsProcessed = 1;

      // Obtener producto desde Odoo
      const odooResponse = await this.odooConnector.syncProductFromOdoo(
        localProduct.odoo_product_id
      );

      if (!odooResponse.success || !odooResponse.data) {
        result.errors.push(
          `Error obteniendo producto desde Odoo: ${odooResponse.error}`
        );
        result.productsFailed = 1;
        result.duration = Date.now() - startTime;
        return result;
      }

      const odooProduct = odooResponse.data;

      // Detectar conflictos
      const conflicts = await this.detectConflicts(localProduct, odooProduct);

      if (conflicts.length > 0) {
        const resolved = await this.resolveConflicts(
          conflicts,
          conflictResolution,
          userId
        );

        if (!resolved) {
          result.errors.push("Conflictos no resueltos");
          result.duration = Date.now() - startTime;
          return result;
        }
      }

      // Aplicar cambios desde Odoo
      const updated = await this.applyOdooChanges(localProduct, odooProduct);

      if (updated) {
        // Invalidar cache
        await CacheService.invalidateProduct(localProduct.barcode);

        // Registrar sincronización
        await auditLogger.logColocacionUpdate(userId, productId, {
          barcode: localProduct.barcode,
          reference: localProduct.reference,
          oldLocation: localProduct.location,
          newLocation: localProduct.location,
          oldStock: localProduct.stock,
          newStock: localProduct.stock,
        });

        result.productsUpdated = 1;
        result.success = true;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      logger.error(`Error sincronizando producto ${productId}:`, error);
      result.errors.push(
        error instanceof Error ? error.message : "Error desconocido"
      );
      result.productsFailed = 1;
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Enviar cambios locales a Odoo
   */
  public async pushToOdoo(
    productId: string,
    changeType: "location" | "stock" | "both",
    userId: string,
    deviceId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      productsProcessed: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: [],
      duration: 0,
    };

    try {
      const product = await Product.findByPk(productId);
      if (!product) {
        result.errors.push("Producto no encontrado");
        result.duration = Date.now() - startTime;
        return result;
      }

      result.productsProcessed = 1;

      // Actualizar ubicación en Odoo
      if (changeType === "location" || changeType === "both") {
        if (product.location) {
          const locationResponse =
            await this.odooConnector.updateProductLocation(
              product.odoo_product_id,
              product.location
            );

          if (!locationResponse.success) {
            result.errors.push(
              `Error actualizando ubicación: ${locationResponse.error}`
            );
          }
        }
      }

      // Actualizar stock en Odoo
      if (changeType === "stock" || changeType === "both") {
        const stockResponse = await this.odooConnector.updateProductStock(
          product.odoo_product_id,
          product.stock
        );

        if (!stockResponse.success) {
          result.errors.push(
            `Error actualizando stock: ${stockResponse.error}`
          );
        }
      }

      if (result.errors.length === 0) {
        // Actualizar timestamp de sincronización
        product.last_odoo_sync = new Date();
        await product.save();

        result.productsUpdated = 1;
        result.success = true;

        // Registrar en auditoría
        await auditLogger.logColocacionUpdate(
          userId,
          productId,
          {
            barcode: product.barcode,
            reference: product.reference,
            oldLocation: product.location,
            newLocation: product.location,
            oldStock: product.stock,
            newStock: product.stock,
          },
          deviceId
        );
      } else {
        result.productsFailed = 1;
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      logger.error(
        `Error enviando cambios a Odoo para producto ${productId}:`,
        error
      );
      result.errors.push(
        error instanceof Error ? error.message : "Error desconocido"
      );
      result.productsFailed = 1;
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Sincronización completa (productos desactualizados)
   */
  public async fullSync(
    maxProducts: number = 100,
    conflictResolution: ConflictResolution = { strategy: "timestamp" }
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: true,
      productsProcessed: 0,
      productsUpdated: 0,
      productsFailed: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Verificar lock de sincronización
      const lockAcquired = await this.acquireSyncLock();
      if (!lockAcquired) {
        result.success = false;
        result.errors.push("Sincronización ya en progreso");
        result.duration = Date.now() - startTime;
        return result;
      }

      try {
        // Obtener productos que necesitan sincronización
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - 1); // Productos no sincronizados en la última hora

        const productsToSync = await Product.findAll({
          where: {
            status: "active",
            [Op.or]: [
              { last_odoo_sync: null },
              { last_odoo_sync: { [Op.lt]: cutoffTime } },
            ],
          },
          limit: maxProducts,
          order: [["last_odoo_sync", "ASC NULLS FIRST"]],
        });

        logger.info(
          `Iniciando sincronización completa de ${productsToSync.length} productos`
        );

        for (const product of productsToSync) {
          try {
            const syncResult = await this.syncProduct(
              product.id,
              "SYSTEM",
              conflictResolution
            );

            result.productsProcessed++;

            if (syncResult.success) {
              result.productsUpdated += syncResult.productsUpdated;
            } else {
              result.productsFailed++;
              result.errors.push(
                `${product.reference}: ${syncResult.errors.join(", ")}`
              );
            }

            // Pequeña pausa para no sobrecargar Odoo
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            result.productsFailed++;
            result.errors.push(`${product.reference}: Error inesperado`);
            logger.error(`Error sincronizando producto ${product.id}:`, error);
          }
        }

        // Estadísticas finales
        result.success = result.productsFailed === 0;

        // Actualizar estadísticas de sincronización
        await this.updateSyncStats(result);

        logger.info("Sincronización completa finalizada", {
          processed: result.productsProcessed,
          updated: result.productsUpdated,
          failed: result.productsFailed,
          duration: Date.now() - startTime,
        });
      } finally {
        await this.releaseSyncLock();
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error) {
      logger.error("Error en sincronización completa:", error);
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : "Error desconocido"
      );
      result.duration = Date.now() - startTime;

      await this.releaseSyncLock();
      return result;
    }
  }

  /**
   * Detectar conflictos entre datos locales y de Odoo
   */
  private async detectConflicts(
    localProduct: Product,
    odooProduct: any
  ): Promise<SyncConflict[]> {
    const conflicts: SyncConflict[] = [];

    // Comparar campos relevantes
    const fieldsToCompare = [
      { local: "reference", odoo: "default_code", field: "reference" },
      { local: "description", odoo: "name", field: "description" },
      { local: "stock", odoo: "qty_available", field: "stock" },
      {
        local: "status",
        odoo: "active",
        field: "status",
        transform: (active: boolean) => (active ? "active" : "inactive"),
      },
    ];

    for (const fieldMap of fieldsToCompare) {
      let localValue = (localProduct as any)[fieldMap.local];
      let odooValue = odooProduct[fieldMap.odoo];

      // Aplicar transformación si existe
      if (fieldMap.transform && fieldMap.field === "status") {
        odooValue = fieldMap.transform(odooValue);
      }

      // Comparar valores
      if (localValue !== odooValue) {
        conflicts.push({
          productId: localProduct.id,
          field: fieldMap.field,
          localValue,
          odooValue,
          localTimestamp: localProduct.updated_at,
          odooTimestamp: new Date(), // Odoo no proporciona timestamp, usar actual
          resolution: "pending",
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolver conflictos según estrategia
   */
  private async resolveConflicts(
    conflicts: SyncConflict[],
    resolution: ConflictResolution,
    userId: string
  ): Promise<boolean> {
    try {
      for (const conflict of conflicts) {
        let resolvedValue: any;

        switch (resolution.strategy) {
          case "odoo_wins":
            resolvedValue = conflict.odooValue;
            break;

          case "local_wins":
            resolvedValue = conflict.localValue;
            break;

          case "timestamp":
            // Preferir el valor más reciente
            resolvedValue =
              conflict.localTimestamp > conflict.odooTimestamp
                ? conflict.localValue
                : conflict.odooValue;
            break;

          case "manual":
            // Guardar conflicto para resolución manual
            await this.saveConflictForManualResolution(conflict, userId);
            return false;

          default:
            resolvedValue = conflict.odooValue;
        }

        // Marcar conflicto como resuelto
        conflict.resolution = "resolved";

        logger.debug(
          `Conflicto resuelto: ${conflict.field} = ${resolvedValue}`,
          {
            productId: conflict.productId,
            strategy: resolution.strategy,
          }
        );
      }

      return true;
    } catch (error) {
      logger.error("Error resolviendo conflictos:", error);
      return false;
    }
  }

  /**
   * Aplicar cambios desde Odoo al producto local
   */
  private async applyOdooChanges(
    localProduct: Product,
    odooProduct: any
  ): Promise<boolean> {
    try {
      let hasChanges = false;

      // Actualizar campos desde Odoo
      if (localProduct.reference !== odooProduct.default_code) {
        localProduct.reference =
          odooProduct.default_code || localProduct.reference;
        hasChanges = true;
      }

      if (localProduct.description !== odooProduct.name) {
        localProduct.description = odooProduct.name || localProduct.description;
        hasChanges = true;
      }

      if (localProduct.stock !== odooProduct.qty_available) {
        localProduct.stock = odooProduct.qty_available || 0;
        hasChanges = true;
      }

      const odooStatus = odooProduct.active ? "active" : "inactive";
      if (localProduct.status !== odooStatus) {
        localProduct.status = odooStatus;
        hasChanges = true;
      }

      if (hasChanges) {
        localProduct.last_odoo_sync = new Date();
        await localProduct.save();

        logger.debug(
          `Producto actualizado desde Odoo: ${localProduct.reference}`
        );
      }

      return hasChanges;
    } catch (error) {
      logger.error("Error aplicando cambios desde Odoo:", error);
      return false;
    }
  }

  /**
   * Guardar conflicto para resolución manual
   */
  private async saveConflictForManualResolution(
    conflict: SyncConflict,
    userId: string
  ): Promise<void> {
    try {
      const conflictKey = `${SyncService.SYNC_CONFLICTS_KEY}:${conflict.productId}:${conflict.field}`;
      const conflictData = {
        ...conflict,
        userId,
        createdAt: new Date().toISOString(),
      };

      await redis.setex(conflictKey, 86400, JSON.stringify(conflictData)); // 24 horas

      logger.info(
        `Conflicto guardado para resolución manual: ${conflict.productId}/${conflict.field}`
      );
    } catch (error) {
      logger.error("Error guardando conflicto:", error);
    }
  }

  /**
   * Adquirir lock de sincronización
   */
  private async acquireSyncLock(): Promise<boolean> {
    try {
      const lockResult = await redis.set(
        SyncService.SYNC_LOCK_KEY,
        Date.now().toString(),
        "PX",
        SyncService.SYNC_TIMEOUT,
        "NX"
      );

      return lockResult === "OK";
    } catch (error) {
      logger.error("Error adquiriendo lock de sincronización:", error);
      return false;
    }
  }

  /**
   * Liberar lock de sincronización
   */
  private async releaseSyncLock(): Promise<void> {
    try {
      await redis.del(SyncService.SYNC_LOCK_KEY);
    } catch (error) {
      logger.error("Error liberando lock de sincronización:", error);
    }
  }

  /**
   * Actualizar estadísticas de sincronización
   */
  private async updateSyncStats(result: SyncResult): Promise<void> {
    try {
      const pipe = redis.pipeline();

      pipe.hincrby(SyncService.SYNC_STATS_KEY, "total_syncs", 1);
      pipe.hincrby(
        SyncService.SYNC_STATS_KEY,
        "products_processed",
        result.productsProcessed
      );
      pipe.hincrby(
        SyncService.SYNC_STATS_KEY,
        "products_updated",
        result.productsUpdated
      );
      pipe.hincrby(
        SyncService.SYNC_STATS_KEY,
        "products_failed",
        result.productsFailed
      );
      pipe.hset(
        SyncService.SYNC_STATS_KEY,
        "last_sync",
        new Date().toISOString()
      );

      if (result.success) {
        pipe.hincrby(SyncService.SYNC_STATS_KEY, "successful_syncs", 1);
      } else {
        pipe.hincrby(SyncService.SYNC_STATS_KEY, "failed_syncs", 1);
      }

      await pipe.exec();
    } catch (error) {
      logger.error("Error actualizando estadísticas de sincronización:", error);
    }
  }

  /**
   * Obtener estadísticas de sincronización
   */
  public async getSyncStats(): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    productsProcessed: number;
    productsUpdated: number;
    productsFailed: number;
    lastSync: string | null;
  }> {
    try {
      const stats = await redis.hmget(
        SyncService.SYNC_STATS_KEY,
        "total_syncs",
        "successful_syncs",
        "failed_syncs",
        "products_processed",
        "products_updated",
        "products_failed",
        "last_sync"
      );

      return {
        totalSyncs: parseInt(stats[0] || "0"),
        successfulSyncs: parseInt(stats[1] || "0"),
        failedSyncs: parseInt(stats[2] || "0"),
        productsProcessed: parseInt(stats[3] || "0"),
        productsUpdated: parseInt(stats[4] || "0"),
        productsFailed: parseInt(stats[5] || "0"),
        lastSync: stats[6],
      };
    } catch (error) {
      logger.error("Error obteniendo estadísticas de sincronización:", error);
      return {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        productsProcessed: 0,
        productsUpdated: 0,
        productsFailed: 0,
        lastSync: null,
      };
    }
  }

  /**
   * Verificar estado de conectividad con Odoo
   */
  public async checkOdooConnectivity(): Promise<{
    isConnected: boolean;
    systemInfo?: any;
    error?: string;
  }> {
    try {
      const connectionTest = await this.odooConnector.testConnection();

      if (connectionTest.success) {
        const systemInfo = await this.odooConnector.getSystemInfo();

        return {
          isConnected: true,
          systemInfo: systemInfo.data,
        };
      }

      return {
        isConnected: false,
        error: connectionTest.error,
      };
    } catch (error) {
      return {
        isConnected: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }
}
