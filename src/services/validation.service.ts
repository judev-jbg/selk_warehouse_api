// src/services/colocacion/validation.service.ts
import { Op } from "sequelize";
import Product from "../models/Product";
import ProductLocation from "../models/ProductLocation";
import { BarcodeValidator } from "../utils/barcode.validator";
import { LocationValidator } from "../utils/location.validator";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

interface LocationValidationContext {
  productId: string;
  currentLocation: string | null;
  newLocation: string | null;
  userId: string;
}

interface StockValidationContext {
  productId: string;
  currentStock: number;
  newStock: number;
  userId: string;
}

export class ValidationService {
  /**
   * Validación completa de actualización de producto
   */
  public static async validateProductUpdate(
    productId: string,
    updateData: { location?: string | null; stock?: number },
    userId: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    try {
      // Obtener producto
      const product = await Product.findByPk(productId);
      if (!product) {
        result.isValid = false;
        result.errors.push("Producto no encontrado");
        return result;
      }

      // Validar ubicación si se proporciona
      if (updateData.location !== undefined) {
        const locationValidation = await this.validateLocationUpdate({
          productId,
          currentLocation: product.location,
          newLocation: updateData.location,
          userId,
        });

        result.errors.push(...locationValidation.errors);
        result.warnings.push(...locationValidation.warnings);
        result.suggestions?.push(...(locationValidation.suggestions || []));

        if (!locationValidation.isValid) {
          result.isValid = false;
        }
      }

      // Validar stock si se proporciona
      if (updateData.stock !== undefined) {
        const stockValidation = await this.validateStockUpdate({
          productId,
          currentStock: product.stock,
          newStock: updateData.stock,
          userId,
        });

        result.errors.push(...stockValidation.errors);
        result.warnings.push(...stockValidation.warnings);
        result.suggestions?.push(...(stockValidation.suggestions || []));

        if (!stockValidation.isValid) {
          result.isValid = false;
        }
      }

      // Validaciones cruzadas
      const crossValidation = await this.validateCrossFieldRules(
        product,
        updateData,
        userId
      );

      result.errors.push(...crossValidation.errors);
      result.warnings.push(...crossValidation.warnings);
      result.suggestions?.push(...(crossValidation.suggestions || []));

      if (!crossValidation.isValid) {
        result.isValid = false;
      }
    } catch (error) {
      logger.error("Error en validación de actualización:", error);
      result.isValid = false;
      result.errors.push("Error interno en la validación");
    }

    return result;
  }

  /**
   * Validar actualización de ubicación
   */
  private static async validateLocationUpdate(
    context: LocationValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    const { currentLocation, newLocation } = context;

    // Si se está eliminando la ubicación
    if (currentLocation && (newLocation === null || newLocation === "")) {
      result.warnings.push("El producto quedará sin ubicación asignada");
      return result;
    }

    // Si no se está cambiando la ubicación
    if (currentLocation === newLocation) {
      return result;
    }

    // Validar formato de nueva ubicación
    if (newLocation) {
      try {
        LocationValidator.validateAndClean(newLocation);
      } catch (error) {
        result.isValid = false;
        result.errors.push(
          error instanceof AppError
            ? error.message
            : "Formato de ubicación inválido"
        );
        return result;
      }

      // Verificar historial de ubicaciones recientes
      const recentLocationChanges = await this.getRecentLocationChanges(
        context.productId,
        5
      );

      if (recentLocationChanges.length >= 3) {
        result.warnings.push(
          "Este producto ha cambiado de ubicación frecuentemente. Verifique que la nueva ubicación sea correcta."
        );
      }

      // Verificar si vuelve a una ubicación anterior reciente
      const previousLocation = recentLocationChanges.find(
        (change) => change.new_location === newLocation
      );

      if (previousLocation) {
        result.warnings.push(
          `Este producto estuvo anteriormente en la ubicación ${newLocation}. Confirme que este cambio es correcto.`
        );
      }

      // Sugerir ubicaciones adyacentes si es apropiado
      if (currentLocation) {
        const adjacentLocations =
          LocationValidator.getAdjacentLocations(currentLocation);
        if (adjacentLocations.includes(newLocation)) {
          result.suggestions?.push(
            "Ubicación adyacente detectada - puede ser más eficiente para el operario"
          );
        }
      }

      // Verificar productos en la misma ubicación
      const productsInLocation = await this.getProductsInLocation(newLocation);
      if (productsInLocation.length > 0) {
        result.warnings.push(
          `La ubicación ${newLocation} ya contiene ${productsInLocation.length} producto(s). Las ubicaciones son compartidas.`
        );

        result.suggestions?.push(
          `Productos en ${newLocation}: ${productsInLocation
            .slice(0, 3)
            .map((p) => p.reference)
            .join(", ")}${productsInLocation.length > 3 ? "..." : ""}`
        );
      }
    }

    return result;
  }

  /**
   * Validar actualización de stock
   */
  private static async validateStockUpdate(
    context: StockValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    const { currentStock, newStock } = context;

    // Validaciones básicas
    if (newStock < 0) {
      result.isValid = false;
      result.errors.push("El stock no puede ser negativo");
      return result;
    }

    // Si no hay cambio real
    if (Math.abs(currentStock - newStock) < 0.001) {
      return result;
    }

    // Verificar cambios significativos
    const percentageChange =
      currentStock > 0
        ? Math.abs((newStock - currentStock) / currentStock) * 100
        : 0;

    if (percentageChange > 50 && currentStock > 0) {
      result.warnings.push(
        `Cambio significativo en el stock: ${percentageChange.toFixed(
          1
        )}% (de ${currentStock} a ${newStock})`
      );
    }

    // Stock cero
    if (newStock === 0 && currentStock > 0) {
      result.warnings.push("Se está poniendo el stock en cero");
    }

    // Stock muy alto
    if (newStock > 10000 && currentStock < 1000) {
      result.warnings.push("Stock inusualmente alto detectado");
      result.suggestions?.push(
        "Verifique que el valor sea correcto y no haya errores de digitación"
      );
    }

    // Verificar historial de cambios de stock recientes
    const recentStockChanges = await this.getRecentStockChanges(
      context.productId,
      3
    );
    if (recentStockChanges.length >= 2) {
      result.warnings.push(
        "Este producto ha tenido cambios de stock frecuentes recientemente"
      );
    }

    // Sugerencia de redondeo para decimales extraños
    if (newStock % 1 !== 0) {
      const rounded = Math.round(newStock);
      if (Math.abs(newStock - rounded) < 0.1) {
        result.suggestions?.push(`¿Quiso decir ${rounded} unidades?`);
      }
    }

    return result;
  }

  /**
   * Validaciones cruzadas entre campos
   */
  private static async validateCrossFieldRules(
    product: Product,
    updateData: { location?: string | null; stock?: number },
    userId: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Si se está poniendo stock pero no hay ubicación
    if (updateData.stock !== undefined && updateData.stock > 0) {
      const finalLocation =
        updateData.location !== undefined
          ? updateData.location
          : product.location;

      if (!finalLocation) {
        result.warnings.push(
          "El producto tendrá stock pero no ubicación. Considere asignar una ubicación."
        );
      }
    }

    // Si se asigna ubicación pero el stock es cero
    if (updateData.location && updateData.location !== "") {
      const finalStock =
        updateData.stock !== undefined ? updateData.stock : product.stock;

      if (finalStock === 0) {
        result.warnings.push(
          "Se está asignando ubicación a un producto sin stock."
        );
      }
    }

    return result;
  }

  /**
   * Obtener cambios recientes de ubicación
   */
  private static async getRecentLocationChanges(
    productId: string,
    limit: number = 5
  ): Promise<ProductLocation[]> {
    try {
      return await ProductLocation.findAll({
        where: { product_id: productId },
        order: [["created_at", "DESC"]],
        limit,
      });
    } catch (error) {
      logger.error("Error obteniendo cambios recientes de ubicación:", error);
      return [];
    }
  }

  /**
   * Obtener cambios recientes de stock (mock - necesitaríamos un modelo de historial de stock)
   */
  private static async getRecentStockChanges(
    productId: string,
    limit: number = 3
  ): Promise<any[]> {
    // TODO: Implementar cuando tengamos un modelo de historial de stock
    // Por ahora retornamos array vacío
    return [];
  }

  /**
   * Obtener productos en una ubicación específica
   */
  private static async getProductsInLocation(
    location: string
  ): Promise<Product[]> {
    try {
      return await Product.findAll({
        where: {
          location: location,
          status: "active",
        },
        attributes: ["id", "reference", "description", "stock"],
        limit: 10, // Limitar para rendimiento
      });
    } catch (error) {
      logger.error("Error obteniendo productos en ubicación:", error);
      return [];
    }
  }

  /**
   * Validar formato de código de barras con sugerencias
   */
  public static validateBarcodeWithSuggestions(
    barcode: string
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    try {
      const cleanedBarcode = BarcodeValidator.clean(barcode);

      if (!BarcodeValidator.validate(cleanedBarcode)) {
        result.isValid = false;
        result.errors.push("Formato de código de barras inválido");

        // Sugerencias basadas en longitud
        if (cleanedBarcode.length < 13) {
          result.suggestions?.push(
            `El código tiene ${cleanedBarcode.length} dígitos. Los códigos EAN13 requieren 13 dígitos.`
          );
        } else if (cleanedBarcode.length > 14) {
          result.suggestions?.push(
            "El código es demasiado largo. Verifique que no tenga caracteres adicionales."
          );
        }

        // Verificar si contiene caracteres no numéricos
        if (!/^\d+$/.test(cleanedBarcode)) {
          result.suggestions?.push(
            "El código de barras debe contener solo números."
          );
        }

        return result;
      }

      // Validar dígito de verificación para EAN13
      const barcodeType = BarcodeValidator.detectType(cleanedBarcode);
      if (barcodeType === "EAN13") {
        if (!BarcodeValidator.validateEAN13CheckDigit(cleanedBarcode)) {
          result.warnings.push(
            "El dígito de verificación del EAN13 no es correcto"
          );

          const correctCheckDigit = BarcodeValidator.calculateEAN13CheckDigit(
            cleanedBarcode.substring(0, 12)
          );
          result.suggestions?.push(
            `El dígito de verificación correcto sería: ${cleanedBarcode.substring(
              0,
              12
            )}${correctCheckDigit}`
          );
        }
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        error instanceof AppError
          ? error.message
          : "Error validando código de barras"
      );
    }

    return result;
  }
}
