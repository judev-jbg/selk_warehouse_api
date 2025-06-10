// src/controllers/colocacion/sync.controller.ts
import { Request, Response, NextFunction } from "express";
import { SyncService } from "../../services/sync.service";
import { ApiResponse } from "../../types/common.types";
import { logger } from "../../utils/logger";

export class SyncController {
  private syncService: SyncService;

  constructor() {
    this.syncService = new SyncService();
  }

  /**
   * POST /api/v1/colocacion/sync/product/:id
   * Sincronizar producto específico con Odoo
   */
  public syncProduct = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const { conflictResolution = "timestamp" } = req.body;
      const userId = req.user!.userId;

      const result = await this.syncService.syncProduct(id, userId, {
        strategy: conflictResolution,
      });

      res.status(result.success ? 200 : 207).json({
        success: result.success,
        data: result,
        message: result.success
          ? "Producto sincronizado correctamente"
          : "Sincronización completada con errores",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error sincronizando producto:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/sync/push/:id
   * Enviar cambios locales a Odoo
   */
  public pushToOdoo = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const { changeType = "both" } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      const result = await this.syncService.pushToOdoo(
        id,
        changeType,
        userId,
        deviceId
      );

      res.status(result.success ? 200 : 207).json({
        success: result.success,
        data: result,
        message: result.success
          ? "Cambios enviados a Odoo correctamente"
          : "Envío completado con errores",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error enviando cambios a Odoo:", error);
      next(error);
    }
  };

  /**
   * POST /api/v1/colocacion/sync/full
   * Ejecutar sincronización completa
   */
  public fullSync = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { maxProducts = 100, conflictResolution = "timestamp" } = req.body;

      const result = await this.syncService.fullSync(maxProducts, {
        strategy: conflictResolution,
      });

      res.status(result.success ? 200 : 207).json({
        success: result.success,
        data: result,
        message: result.success
          ? "Sincronización completa exitosa"
          : "Sincronización completada con errores",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error en sincronización completa:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/sync/stats
   * Obtener estadísticas de sincronización
   */
  public getSyncStats = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const stats = await this.syncService.getSyncStats();

      res.status(200).json({
        success: true,
        data: stats,
        message: "Estadísticas de sincronización obtenidas",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo estadísticas de sincronización:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/sync/connectivity
   * Verificar conectividad con Odoo
   */
  public checkConnectivity = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const connectivity = await this.syncService.checkOdooConnectivity();

      res.status(200).json({
        success: connectivity.isConnected,
        data: connectivity,
        message: connectivity.isConnected
          ? "Conectividad con Odoo verificada"
          : "Sin conectividad con Odoo",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error verificando conectividad:", error);
      next(error);
    }
  };
}
