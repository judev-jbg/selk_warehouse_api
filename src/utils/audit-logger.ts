// src/utils/audit-logger.ts
import { logger } from "./logger";
import { SupabaseService } from "../services/supabase.service";

interface ColocacionAuditData {
  barcode: string;
  reference: string;
  oldLocation: string | null;
  newLocation: string | null;
  oldStock: number;
  newStock: number;
}

interface SearchAuditData {
  barcode: string;
  found: boolean;
  searchDuration: number; // en milisegundos
}

interface LabelAuditData {
  barcode: string;
  reference: string;
  location: string;
  action: "created" | "printed" | "deleted";
}

class AuditLoggerExtended {
  private supabaseService: SupabaseService;

  constructor() {
    this.supabaseService = new SupabaseService();
  }

  /**
   * Log de búsqueda de productos
   */
  async logProductSearch(
    userId: string,
    deviceId: string,
    searchData: SearchAuditData,
    ipAddress?: string
  ): Promise<void> {
    try {
      const metadata = {
        ...searchData,
        module: "colocacion",
        action_type: "search",
        timestamp: new Date().toISOString(),
      };

      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: "product_search",
        device_identifier: deviceId,
        ip_address: ipAddress,
        metadata,
      });

      logger.info("Búsqueda de producto registrada", {
        type: "audit",
        module: "colocacion",
        userId,
        deviceId,
        ...searchData,
      });
    } catch (error) {
      logger.error("Error registrando búsqueda de producto:", error);
    }
  }

  /**
   * Log de actualización de ubicación y stock
   */
  async logColocacionUpdate(
    userId: string,
    productId: string,
    updateData: ColocacionAuditData,
    deviceId?: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      const metadata = {
        product_id: productId,
        ...updateData,
        module: "colocacion",
        action_type: "update",
        timestamp: new Date().toISOString(),
        location_changed: updateData.oldLocation !== updateData.newLocation,
        stock_changed: updateData.oldStock !== updateData.newStock,
      };

      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: "product_update",
        device_identifier: deviceId || "unknown",
        ip_address: ipAddress,
        metadata,
      });

      logger.info("Actualización de producto registrada", {
        type: "audit",
        module: "colocacion",
        userId,
        productId,
        ...updateData,
      });
    } catch (error) {
      logger.error("Error registrando actualización de producto:", error);
    }
  }

  /**
   * Log de operaciones con etiquetas
   */
  async logLabelOperation(
    userId: string,
    deviceId: string,
    labelData: LabelAuditData,
    ipAddress?: string
  ): Promise<void> {
    try {
      const metadata = {
        ...labelData,
        module: "colocacion",
        action_type: "label_operation",
        timestamp: new Date().toISOString(),
      };

      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: `label_${labelData.action}`,
        device_identifier: deviceId,
        ip_address: ipAddress,
        metadata,
      });

      logger.info(`Operación de etiqueta ${labelData.action} registrada`, {
        type: "audit",
        module: "colocacion",
        userId,
        deviceId,
        ...labelData,
      });
    } catch (error) {
      logger.error("Error registrando operación de etiqueta:", error);
    }
  }

  /**
   * Log de errores en colocación
   */
  async logColocacionError(
    userId: string,
    deviceId: string,
    errorData: {
      action: string;
      error: string;
      barcode?: string;
      context?: any;
    },
    ipAddress?: string
  ): Promise<void> {
    try {
      const metadata = {
        ...errorData,
        module: "colocacion",
        action_type: "error",
        timestamp: new Date().toISOString(),
      };

      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: "colocacion_error",
        device_identifier: deviceId,
        ip_address: ipAddress,
        metadata,
      });

      logger.error("Error en colocación registrado", {
        type: "audit",
        module: "colocacion",
        userId,
        deviceId,
        ...errorData,
      });
    } catch (error) {
      logger.error("Error registrando error de colocación:", error);
    }
  }

  /**
   * Log de acceso al módulo de colocación
   */
  async logModuleAccess(
    userId: string,
    deviceId: string,
    ipAddress?: string
  ): Promise<void> {
    try {
      const metadata = {
        module: "colocacion",
        action_type: "module_access",
        timestamp: new Date().toISOString(),
      };

      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: "module_access",
        device_identifier: deviceId,
        ip_address: ipAddress,
        metadata,
      });

      logger.info("Acceso al módulo de colocación registrado", {
        type: "audit",
        module: "colocacion",
        userId,
        deviceId,
      });
    } catch (error) {
      logger.error("Error registrando acceso al módulo:", error);
    }
  }
}

// Instancia singleton
export const auditLogger = new AuditLoggerExtended();
