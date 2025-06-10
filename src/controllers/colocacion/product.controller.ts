// src/controllers/colocacion/product.controller.ts
import { Request, Response, NextFunction } from "express";
import { ProductService } from "../../services/product.service";
import { CacheService } from "../../services/cache.service";
import { ApiResponse } from "../../types/common.types";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../utils/audit-logger";

export class ProductController {
  /**
   * GET /api/v1/colocacion/products/search/:barcode
   * Buscar producto por código de barras
   */
  public searchByBarcode = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { barcode } = req.params;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      logger.info(`Búsqueda de producto iniciada: ${barcode}`, {
        userId,
        deviceId,
        ipAddress,
      });

      const result = await ProductService.searchByBarcode(
        barcode,
        userId,
        deviceId,
        ipAddress
      );

      if (result.found && result.product) {
        // Respuesta exitosa con producto encontrado
        res.status(200).json({
          success: true,
          data: {
            product: {
              id: result.product.id,
              barcode: result.product.barcode,
              reference: result.product.reference,
              description: result.product.description,
              location: result.product.location,
              stock: result.product.stock,
              status: result.product.status,
              odoo_product_id: result.product.odoo_product_id,
              last_odoo_sync: result.product.last_odoo_sync,
            },
            searchInfo: {
              found: result.found,
              source: result.source,
              searchDuration: result.searchDuration,
            },
          },
          message: "Producto encontrado",
          timestamp: new Date().toISOString(),
        });
      } else {
        // Producto no encontrado
        res.status(404).json({
          success: false,
          data: {
            searchInfo: {
              found: false,
              source: result.source,
              searchDuration: result.searchDuration,
            },
          },
          error: "Producto no encontrado",
          message: `No se encontró ningún producto con el código de barras: ${barcode}`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error("Error en búsqueda de producto:", error);
      next(error);
    }
  };

  /**
   * PATCH /api/v1/colocacion/products/:id
   * Actualizar ubicación y/o stock de un producto
   */
  public updateProduct = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const { location, stock } = req.body;
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      logger.info(`Actualización de producto iniciada: ${id}`, {
        location,
        stock,
        userId,
        deviceId,
      });

      const result = await ProductService.updateProduct(
        id,
        { location, stock },
        userId,
        deviceId,
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: {
          product: {
            id: result.product.id,
            barcode: result.product.barcode,
            reference: result.product.reference,
            description: result.product.description,
            location: result.product.location,
            stock: result.product.stock,
            status: result.product.status,
            last_odoo_sync: result.product.last_odoo_sync,
          },
          changes: result.changes,
          labelCreated: result.labelCreated || false,
        },
        message: "Producto actualizado correctamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error actualizando producto:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/products/:id/location-history
   * Obtener historial de ubicaciones de un producto
   */
  public getLocationHistory = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const history = await ProductService.getLocationHistory(id, limit);

      res.status(200).json({
        success: true,
        data: history,
        message: "Historial de ubicaciones obtenido",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo historial de ubicaciones:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/products/location/:location
   * Buscar productos por ubicación
   */
  public getProductsByLocation = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { location } = req.params;

      const products = await ProductService.getProductsByLocation(location);

      res.status(200).json({
        success: true,
        data: products.map((product) => ({
          id: product.id,
          barcode: product.barcode,
          reference: product.reference,
          description: product.description,
          stock: product.stock,
          status: product.status,
        })),
        message: `Productos encontrados en ubicación ${location}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error buscando productos por ubicación:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/products/location/:location/availability
   * Verificar disponibilidad de ubicación
   */
  public checkLocationAvailability = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const { location } = req.params;

      const availability = await ProductService.checkLocationAvailability(
        location
      );

      res.status(200).json({
        success: true,
        data: availability,
        message: `Información de disponibilidad para ubicación ${location}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error verificando disponibilidad de ubicación:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/stats
   * Obtener estadísticas del módulo de colocación
   */
  public getStats = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      // Registrar acceso a estadísticas
      await auditLogger.logModuleAccess(userId, deviceId, ipAddress);

      const stats = await ProductService.getColocacionStats();

      res.status(200).json({
        success: true,
        data: stats,
        message: "Estadísticas de colocación obtenidas",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo estadísticas:", error);
      next(error);
    }
  };

  /**
   * GET /api/v1/colocacion/cache/frequent
   * Obtener productos frecuentemente consultados
   */
  public getFrequentProducts = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const frequentBarcodes = await CacheService.getFrequentProducts(limit);

      res.status(200).json({
        success: true,
        data: {
          frequentProducts: frequentBarcodes,
          count: frequentBarcodes.length,
        },
        message: "Productos frecuentes obtenidos",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error obteniendo productos frecuentes:", error);
      next(error);
    }
  };

  /**
   * DELETE /api/v1/colocacion/cache/clear
   * Limpiar cache de productos (solo para administradores)
   */
  public clearCache = async (
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      const userId = req.user!.userId;
      const deviceId = req.deviceId!;

      await CacheService.clearProductCache();
      await CacheService.resetCacheStats();

      // Registrar operación de limpieza de cache
      await auditLogger.logColocacionError(userId, deviceId, {
        action: "clear_cache",
        error: "Cache cleared by administrator",
        context: { manual: true },
      });

      res.status(200).json({
        success: true,
        message: "Cache de productos limpiado correctamente",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error limpiando cache:", error);
      next(error);
    }
  };
}
