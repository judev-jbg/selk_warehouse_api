// src/services/colocacion/odoo-connector.service.ts
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { config } from "../config/index";
import { logger } from "../utils/logger";
import { AppError } from "../middlewares/error.middleware";

interface OdooCredentials {
  url: string;
  database: string;
  username: string;
  password: string;
}

interface OdooProductData {
  id: number;
  name: string;
  default_code: string; // referencia
  barcode: string;
  qty_available: number; // stock
  location_id?: number;
  location_name?: string;
  active: boolean;
  list_price: number;
  standard_price: number;
  categ_id: number[];
  uom_id: number[];
  tracking: string;
}

interface OdooLocationData {
  id: number;
  name: string;
  complete_name: string;
  barcode?: string;
  location_id: number[];
  child_ids: number[];
  active: boolean;
  usage: string; // 'internal', 'customer', 'supplier', etc.
}

interface OdooStockQuantData {
  id: number;
  product_id: number[];
  location_id: number[];
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

interface OdooResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: any;
}

export class OdooConnectorService {
  private axiosInstance: AxiosInstance;
  private credentials: OdooCredentials;
  private sessionId: string | null = null;
  private lastAuthTime: Date | null = null;
  private readonly AUTH_TIMEOUT = 3600000; // 1 hora

  constructor() {
    this.credentials = {
      url: config.odoo.url,
      database: config.odoo.database,
      username: config.odoo.username,
      password: config.odoo.password,
    };

    this.axiosInstance = axios.create({
      baseURL: this.credentials.url,
      timeout: 30000, // 30 segundos
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SELK-Warehouse-API/1.0.0",
      },
    });

    this.setupInterceptors();
  }

  /**
   * Configurar interceptores de Axios
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug(
          `Odoo Request: ${config.method?.toUpperCase()} ${config.url}`,
          {
            data: config.data,
            params: config.params,
          }
        );
        return config;
      },
      (error) => {
        logger.error("Odoo Request Error:", error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug(`Odoo Response: ${response.status}`, {
          url: response.config.url,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error("Odoo Response Error:", {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Autenticar contra Odoo
   */
  private async authenticate(): Promise<boolean> {
    try {
      // Verificar si ya tenemos una sesión válida
      if (this.sessionId && this.lastAuthTime) {
        const now = new Date();
        const timeSinceAuth = now.getTime() - this.lastAuthTime.getTime();

        if (timeSinceAuth < this.AUTH_TIMEOUT) {
          return true; // Sesión aún válida
        }
      }

      logger.info("Autenticando contra Odoo...");

      const authData = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [
            this.credentials.database,
            this.credentials.username,
            this.credentials.password,
            {},
          ],
        },
        id: Math.floor(Math.random() * 1000000),
      };

      const response = await this.axiosInstance.post("/jsonrpc", authData);

      if (response.data.error) {
        throw new Error(`Odoo Auth Error: ${response.data.error.message}`);
      }

      if (response.data.result) {
        this.sessionId = response.data.result.toString();
        this.lastAuthTime = new Date();
        logger.info("Autenticación exitosa contra Odoo");
        return true;
      }

      throw new Error("No se recibió ID de sesión de Odoo");
    } catch (error) {
      logger.error("Error autenticando contra Odoo:", error);
      this.sessionId = null;
      this.lastAuthTime = null;
      return false;
    }
  }

  /**
   * Ejecutar llamada RPC a Odoo
   */
  private async executeRPC(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: any = {}
  ): Promise<any> {
    await this.ensureAuthenticated();

    const rpcData = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          this.credentials.database,
          parseInt(this.sessionId!),
          this.credentials.password,
          model,
          method,
          args,
          kwargs,
        ],
      },
      id: Math.floor(Math.random() * 1000000),
    };

    const response = await this.axiosInstance.post("/jsonrpc", rpcData);

    if (response.data.error) {
      throw new Error(`Odoo RPC Error: ${response.data.error.message}`);
    }

    return response.data.result;
  }

  /**
   * Asegurar que estamos autenticados
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!(await this.authenticate())) {
      throw new AppError("No se pudo autenticar contra Odoo", 503);
    }
  }

  /**
   * Buscar producto por código de barras
   */
  public async searchProductByBarcode(
    barcode: string
  ): Promise<OdooResponse<OdooProductData>> {
    try {
      logger.debug(
        `Buscando producto en Odoo por código de barras: ${barcode}`
      );

      const products = await this.executeRPC(
        "product.product",
        "search_read",
        [
          [
            ["barcode", "=", barcode],
            ["active", "=", true],
          ],
        ],
        {
          fields: [
            "id",
            "name",
            "default_code",
            "barcode",
            "qty_available",
            "active",
            "list_price",
            "standard_price",
            "categ_id",
            "uom_id",
            "tracking",
          ],
          limit: 1,
        }
      );

      if (products && products.length > 0) {
        const product = products[0];

        // Obtener información de ubicación si existe
        const locationInfo = await this.getProductLocation(product.id);

        const productData: OdooProductData = {
          ...product,
          location_id: locationInfo?.location_id,
          location_name: locationInfo?.location_name,
        };

        return {
          success: true,
          data: productData,
        };
      }

      return {
        success: false,
        error: "Producto no encontrado en Odoo",
      };
    } catch (error) {
      logger.error(`Error buscando producto en Odoo: ${barcode}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        errorDetails: error,
      };
    }
  }

  /**
   * Actualizar stock de producto en Odoo
   */
  public async updateProductStock(
    productId: number,
    newQuantity: number,
    locationId?: number
  ): Promise<OdooResponse<boolean>> {
    try {
      logger.info(
        `Actualizando stock en Odoo: Producto ${productId}, Cantidad ${newQuantity}`
      );

      // En Odoo, los ajustes de stock se hacen mediante stock.inventory
      const inventoryData = {
        name: `Ajuste PDA ${new Date().toISOString()}`,
        location_ids: locationId ? [[6, 0, [locationId]]] : false,
        product_ids: [[6, 0, [productId]]],
        state: "draft",
      };

      // Crear inventario
      const inventoryId = await this.executeRPC("stock.inventory", "create", [
        inventoryData,
      ]);

      // Crear línea de inventario
      const lineData = {
        inventory_id: inventoryId,
        product_id: productId,
        product_qty: newQuantity,
        location_id: locationId || (await this.getDefaultLocationId()),
      };

      await this.executeRPC("stock.inventory.line", "create", [lineData]);

      // Validar inventario
      await this.executeRPC("stock.inventory", "action_validate", [
        inventoryId,
      ]);

      logger.info(
        `Stock actualizado exitosamente en Odoo: Producto ${productId}`
      );

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      logger.error(
        `Error actualizando stock en Odoo: Producto ${productId}`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        errorDetails: error,
      };
    }
  }

  /**
   * Actualizar ubicación de producto en Odoo
   */
  public async updateProductLocation(
    productId: number,
    newLocationCode: string
  ): Promise<OdooResponse<boolean>> {
    try {
      logger.info(
        `Actualizando ubicación en Odoo: Producto ${productId}, Ubicación ${newLocationCode}`
      );

      // Buscar ubicación por código
      const location = await this.searchLocationByCode(newLocationCode);
      if (!location.success || !location.data) {
        // Si no existe la ubicación, crearla
        const newLocation = await this.createLocation(newLocationCode);
        if (!newLocation.success) {
          return {
            success: false,
            error: newLocation.error,
            errorDetails: newLocation.errorDetails,
          };
        }
      }

      const locationId =
        location.data?.id ||
        (await this.searchLocationByCode(newLocationCode)).data?.id;

      // Mover stock a nueva ubicación (esto depende de la configuración específica de Odoo)
      // Por ahora, actualizamos el campo personalizado si existe
      const updateResult = await this.executeRPC("product.product", "write", [
        [productId],
        {
          // Campo personalizado para ubicación preferida
          x_location_code: newLocationCode,
          x_location_id: locationId,
        },
      ]);

      logger.info(
        `Ubicación actualizada exitosamente en Odoo: Producto ${productId}`
      );

      return {
        success: true,
        data: updateResult,
      };
    } catch (error) {
      logger.error(
        `Error actualizando ubicación en Odoo: Producto ${productId}`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        errorDetails: error,
      };
    }
  }

  /**
   * Buscar ubicación por código
   */
  private async searchLocationByCode(
    locationCode: string
  ): Promise<OdooResponse<OdooLocationData>> {
    try {
      const locations = await this.executeRPC(
        "stock.location",
        "search_read",
        [
          [
            ["barcode", "=", locationCode],
            ["active", "=", true],
          ],
        ],
        {
          fields: [
            "id",
            "name",
            "complete_name",
            "barcode",
            "location_id",
            "child_ids",
            "active",
            "usage",
          ],
          limit: 1,
        }
      );

      if (locations && locations.length > 0) {
        return {
          success: true,
          data: locations[0],
        };
      }

      return {
        success: false,
        error: "Ubicación no encontrada",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }

  /**
   * Crear nueva ubicación en Odoo
   */
  private async createLocation(
    locationCode: string
  ): Promise<OdooResponse<number>> {
    try {
      const defaultParentId = await this.getDefaultLocationId();

      const locationData = {
        name: `Ubicación ${locationCode}`,
        barcode: locationCode,
        location_id: defaultParentId,
        usage: "internal",
        active: true,
      };

      const locationId = await this.executeRPC("stock.location", "create", [
        locationData,
      ]);

      logger.info(
        `Ubicación creada en Odoo: ${locationCode} (ID: ${locationId})`
      );

      return {
        success: true,
        data: locationId,
      };
    } catch (error) {
      logger.error(`Error creando ubicación en Odoo: ${locationCode}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      };
    }
  }

  /**
   * Obtener ubicación por defecto
   */
  private async getDefaultLocationId(): Promise<number> {
    try {
      const locations = await this.executeRPC(
        "stock.location",
        "search",
        [
          [
            ["usage", "=", "internal"],
            ["active", "=", true],
          ],
        ],
        { limit: 1 }
      );

      return locations && locations.length > 0 ? locations[0] : 1;
    } catch (error) {
      logger.error("Error obteniendo ubicación por defecto:", error);
      return 1; // Fallback
    }
  }

  /**
   * Obtener ubicación actual de un producto
   */
  private async getProductLocation(productId: number): Promise<{
    location_id?: number;
    location_name?: string;
  } | null> {
    try {
      // Buscar stock quant para obtener ubicación
      const quants = await this.executeRPC(
        "stock.quant",
        "search_read",
        [
          [
            ["product_id", "=", productId],
            ["quantity", ">", 0],
          ],
        ],
        {
          fields: ["location_id", "quantity"],
          limit: 1,
        }
      );

      if (quants && quants.length > 0) {
        const quant = quants[0];
        return {
          location_id: quant.location_id[0],
          location_name: quant.location_id[1],
        };
      }

      return null;
    } catch (error) {
      logger.error(
        `Error obteniendo ubicación del producto ${productId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Verificar conectividad con Odoo
   */
  public async testConnection(): Promise<OdooResponse<boolean>> {
    try {
      const success = await this.authenticate();

      if (success) {
        // Hacer una consulta simple para verificar conectividad completa
        await this.executeRPC("res.users", "search", [[]], { limit: 1 });

        return {
          success: true,
          data: true,
        };
      }

      return {
        success: false,
        error: "No se pudo autenticar",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error de conexión",
        errorDetails: error,
      };
    }
  }

  /**
   * Sincronizar producto desde Odoo
   */
  public async syncProductFromOdoo(
    odooProductId: number
  ): Promise<OdooResponse<OdooProductData>> {
    try {
      const products = await this.executeRPC(
        "product.product",
        "read",
        [odooProductId],
        {
          fields: [
            "id",
            "name",
            "default_code",
            "barcode",
            "qty_available",
            "active",
            "list_price",
            "standard_price",
            "categ_id",
            "uom_id",
            "tracking",
          ],
        }
      );

      if (products && products.length > 0) {
        const product = products[0];
        const locationInfo = await this.getProductLocation(product.id);

        return {
          success: true,
          data: {
            ...product,
            location_id: locationInfo?.location_id,
            location_name: locationInfo?.location_name,
          },
        };
      }

      return {
        success: false,
        error: "Producto no encontrado",
      };
    } catch (error) {
      logger.error(
        `Error sincronizando producto desde Odoo: ${odooProductId}`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        errorDetails: error,
      };
    }
  }

  /**
   * Obtener información del sistema Odoo
   */
  public async getSystemInfo(): Promise<
    OdooResponse<{
      server_version: string;
      server_version_info: any;
      database: string;
      username: string;
    }>
  > {
    try {
      await this.ensureAuthenticated();

      const versionInfo = await this.executeRPC(
        "ir.config_parameter",
        "get_param",
        ["base.server_version"]
      );

      return {
        success: true,
        data: {
          server_version: versionInfo || "Unknown",
          server_version_info: {},
          database: this.credentials.database,
          username: this.credentials.username,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error obteniendo información del sistema",
      };
    }
  }
}
