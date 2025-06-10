// src/services/colocacion/product.service.ts
import { Op } from "sequelize";
import Product from "../models/Product";
import ProductLocation from "../models/ProductLocation";
import ProductLabel from "../models/ProductLabel";
import { CacheService } from "./cache.service";
import { BarcodeValidator } from "../utils/barcode.validator";
import { LocationValidator } from "../utils/location.validator";
import { auditLogger } from "../utils/audit-logger";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface ProductSearchResult {
  product: Product | null;
  found: boolean;
  source: "cache" | "database";
  searchDuration: number;
}

interface ProductUpdateData {
  location?: string;
  stock?: number;
}

interface ProductUpdateResult {
  success: boolean;
  product: Product;
  changes: {
    locationChanged: boolean;
    stockChanged: boolean;
  };
  labelCreated?: boolean;
}

export class ProductService {
  /**
   * Buscar producto por código de barras
   */
  public static async searchByBarcode(
    barcode: string,
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<ProductSearchResult> {
    const startTime = Date.now();
    let product: Product | null = null;
    let source: "cache" | "database" = "database";

    try {
      // Validar y limpiar código de barras
      const cleanBarcode = BarcodeValidator.validateAndClean(barcode);

      // Intentar obtener desde cache primero
      product = await CacheService.getProduct(cleanBarcode);

      if (product) {
        source = "cache";
        logger.debug(`Producto encontrado en cache: ${cleanBarcode}`);
      } else {
        // Buscar en base de datos
        product = await Product.findOne({
          where: {
            barcode: cleanBarcode,
            status: "active", // Solo productos activos
          },
        });

        if (product) {
          source = "database";
          // Guardar en cache para futuras consultas
          await CacheService.setProduct(product);
          logger.debug(
            `Producto encontrado en BD y guardado en cache: ${cleanBarcode}`
          );
        }
      }

      const searchDuration = Date.now() - startTime;
      const found = product !== null;

      // Registrar búsqueda en auditoría
      await auditLogger.logProductSearch(
        userId,
        deviceId,
        {
          barcode: cleanBarcode,
          found,
          searchDuration,
        },
        ipAddress
      );

      return {
        product,
        found,
        source,
        searchDuration,
      };
    } catch (error) {
      const searchDuration = Date.now() - startTime;

      logger.error(
        `Error buscando producto por código de barras: ${barcode}`,
        error
      );

      // Registrar error en auditoría
      await auditLogger.logColocacionError(
        userId,
        deviceId,
        {
          action: "search_product",
          error: error instanceof Error ? error.message : "Error desconocido",
          barcode,
          context: { searchDuration },
        },
        ipAddress
      );

      throw error;
    }
  }

  /**
   * Actualizar ubicación y/o stock de un producto
   */
  public static async updateProduct(
    productId: string,
    updateData: ProductUpdateData,
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<ProductUpdateResult> {
    try {
      // Buscar producto existente
      const product = await Product.findByPk(productId);

      if (!product) {
        throw new AppError("Producto no encontrado", 404);
      }

      if (!product.isActive()) {
        throw new AppError("No se puede actualizar un producto inactivo", 400);
      }

      // Validar datos de entrada
      let validatedLocation: string | null = null;
      if (updateData.location !== undefined) {
        if (updateData.location === null || updateData.location === "") {
          validatedLocation = null; // Permitir limpiar ubicación
        } else {
          validatedLocation = LocationValidator.validateAndClean(
            updateData.location
          );
        }
      }

      if (updateData.stock !== undefined) {
        if (updateData.stock < 0) {
          throw new AppError("El stock no puede ser negativo", 400);
        }
      }

      // Guardar valores anteriores para auditoría
      const oldLocation = product.location;
      const oldStock = product.stock;

      // Determinar qué campos han cambiado
      const locationChanged =
        updateData.location !== undefined && oldLocation !== validatedLocation;
      const stockChanged =
        updateData.stock !== undefined && oldStock !== updateData.stock;

      // Si no hay cambios, no hacer nada
      if (!locationChanged && !stockChanged) {
        return {
          success: true,
          product,
          changes: {
            locationChanged: false,
            stockChanged: false,
          },
        };
      }

      // Aplicar cambios
      if (locationChanged) {
        product.location = validatedLocation;

        // Registrar cambio de ubicación en historial
        await ProductLocation.create({
          product_id: product.id,
          old_location: oldLocation,
          new_location: validatedLocation,
          changed_by: userId,
          change_reason: "Manual update from colocacion module",
        });
      }

      if (stockChanged) {
        product.stock = updateData.stock!;
      }

      // Actualizar timestamp de sincronización
      product.last_odoo_sync = new Date();

      // Guardar cambios
      await product.save();

      // Invalidar cache
      await CacheService.invalidateProduct(product.barcode);

      // Crear etiqueta si cambió la ubicación
      let labelCreated = false;
      if (locationChanged && validatedLocation) {
        await this.createOrUpdateLabel(product, userId, deviceId);
        labelCreated = true;
      }

      // Registrar en auditoría
      await auditLogger.logColocacionUpdate(
        userId,
        product.id,
        {
          barcode: product.barcode,
          reference: product.reference,
          oldLocation,
          newLocation: validatedLocation,
          oldStock,
          newStock: product.stock,
        },
        deviceId,
        ipAddress
      );

      logger.info(`Producto actualizado: ${product.barcode}`, {
        productId: product.id,
        locationChanged,
        stockChanged,
        labelCreated,
        userId,
      });

      return {
        success: true,
        product,
        changes: {
          locationChanged,
          stockChanged,
        },
        labelCreated,
      };
    } catch (error) {
      logger.error(`Error actualizando producto: ${productId}`, error);

      // Registrar error en auditoría
      await auditLogger.logColocacionError(
        userId,
        deviceId,
        {
          action: "update_product",
          error: error instanceof Error ? error.message : "Error desconocido",
          context: { productId, updateData },
        },
        ipAddress
      );

      throw error;
    }
  }

  /**
   * Crear o actualizar etiqueta para un producto
   */
  private static async createOrUpdateLabel(
    product: Product,
    userId: string,
    deviceId: string
  ): Promise<ProductLabel> {
    try {
      // Buscar etiqueta existente para este producto y usuario
      let label = await ProductLabel.findOne({
        where: {
          product_id: product.id,
          created_by: userId,
        },
      });

      if (label) {
        // Actualizar etiqueta existente
        label.barcode = product.barcode;
        label.reference = product.reference;
        label.description = product.description;
        label.location = product.location!;
        label.device_identifier = deviceId;
        label.is_printed = false; // Resetear estado de impresión
        label.printed_at = null;

        await label.save();

        logger.debug(`Etiqueta actualizada para producto: ${product.barcode}`);
      } else {
        // Crear nueva etiqueta
        label = await ProductLabel.create({
          product_id: product.id,
          barcode: product.barcode,
          reference: product.reference,
          description: product.description,
          location: product.location!,
          created_by: userId,
          device_identifier: deviceId,
        });

        logger.debug(`Nueva etiqueta creada para producto: ${product.barcode}`);
      }

      // Registrar operación de etiqueta en auditoría
      await auditLogger.logLabelOperation(userId, deviceId, {
        barcode: product.barcode,
        reference: product.reference,
        location: product.location!,
        action: "created",
      });

      return label;
    } catch (error) {
      logger.error(
        `Error creando/actualizando etiqueta para producto: ${product.barcode}`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener historial de ubicaciones de un producto
   */
  public static async getLocationHistory(
    productId: string,
    limit: number = 10
  ): Promise<ProductLocation[]> {
    try {
      return await ProductLocation.findAll({
        where: { product_id: productId },
        order: [["created_at", "DESC"]],
        limit,
      });
    } catch (error) {
      logger.error(
        `Error obteniendo historial de ubicaciones: ${productId}`,
        error
      );
      throw new AppError("Error obteniendo historial de ubicaciones", 500);
    }
  }

  /**
   * Buscar productos por ubicación
   */
  public static async getProductsByLocation(
    location: string
  ): Promise<Product[]> {
    try {
      const validatedLocation = LocationValidator.validateAndClean(location);

      return await Product.findAll({
        where: {
          location: validatedLocation,
          status: "active",
        },
        order: [["reference", "ASC"]],
      });
    } catch (error) {
      logger.error(
        `Error buscando productos por ubicación: ${location}`,
        error
      );
      throw error;
    }
  }

  /**
   * Verificar disponibilidad de ubicación (productos en la misma ubicación)
   */
  public static async checkLocationAvailability(location: string): Promise<{
    isAvailable: boolean;
    productCount: number;
    products: Array<{ reference: string; description: string; stock: number }>;
  }> {
    try {
      const validatedLocation = LocationValidator.validateAndClean(location);

      const products = await Product.findAll({
        where: {
          location: validatedLocation,
          status: "active",
        },
        attributes: ["reference", "description", "stock"],
        order: [["reference", "ASC"]],
      });

      return {
        isAvailable: true, // Las ubicaciones son compartidas según requerimientos
        productCount: products.length,
        products: products.map((p) => ({
          reference: p.reference,
          description: p.description,
          stock: p.stock,
        })),
      };
    } catch (error) {
      logger.error(
        `Error verificando disponibilidad de ubicación: ${location}`,
        error
      );
      throw error;
    }
  }

  /**
   * Obtener estadísticas del módulo de colocación
   */
  public static async getColocacionStats(): Promise<{
    totalProducts: number;
    productsWithLocation: number;
    productsWithoutLocation: number;
    averageStock: number;
    cacheStats: any;
  }> {
    try {
      const [
        totalProducts,
        productsWithLocation,
        productsWithoutLocation,
        stockResult,
        cacheStats,
      ] = await Promise.all([
        Product.count({ where: { status: "active" } }),
        Product.count({
          where: { status: "active", location: { [Op.not]: null } },
        }),
        Product.count({ where: { status: "active", location: null } }),
        Product.findAll({
          where: { status: "active" },
          attributes: [
            [
              Product.sequelize!.fn("AVG", Product.sequelize!.col("stock")),
              "avgStock",
            ],
          ],
          raw: true,
        }),
        CacheService.getCacheStats(),
      ]);

      const averageStock = parseFloat((stockResult[0] as any).avgStock || "0");

      return {
        totalProducts,
        productsWithLocation,
        productsWithoutLocation,
        averageStock,
        cacheStats,
      };
    } catch (error) {
      logger.error("Error obteniendo estadísticas de colocación:", error);
      throw new AppError("Error obteniendo estadísticas", 500);
    }
  }
}
