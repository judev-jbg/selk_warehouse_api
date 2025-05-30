// src/services/odoo.service.ts
import { config } from "../config/index";
import { logger } from "../utils/logger.util";

interface OdooUser {
  id: number;
  login: string;
  name: string;
  email: string;
  active: boolean;
}

export class OdooService {
  private baseUrl: string;
  private database: string;
  private username: string;
  private password: string;

  constructor() {
    this.baseUrl = config.odoo.url;
    this.database = config.odoo.database;
    this.username = config.odoo.username;
    this.password = config.odoo.password;
  }

  /**
   * Autentica usuario contra Odoo (simulado por ahora)
   * TODO: Implementar conexión real cuando tengamos acceso a Odoo en producción
   */
  async authenticateUser(
    username: string,
    password: string
  ): Promise<OdooUser | null> {
    try {
      logger.info(`Intentando autenticar usuario: ${username}`);

      // SIMULACIÓN: En desarrollo, aceptamos algunos usuarios de prueba
      if (config.nodeEnv === "development") {
        const mockUsers: OdooUser[] = [
          {
            id: 1,
            login: "admin",
            name: "Administrador SELK",
            email: "admin@selk.com",
            active: true,
          },
          {
            id: 2,
            login: "operario1",
            name: "Juan Pérez",
            email: "operario1@selk.com",
            active: true,
          },
          {
            id: 3,
            login: "operario2",
            name: "María García",
            email: "operario2@selk.com",
            active: true,
          },
        ];

        const user = mockUsers.find((u) => u.login === username);
        if (user && (password === "admin" || password === "123456")) {
          logger.info(`Usuario autenticado correctamente: ${username}`);
          return user;
        }
      }

      // TODO: Implementar cuando tengamos acceso a Odoo
      // const response = await this.callOdooAPI('/web/session/authenticate', {
      //   db: this.database,
      //   login: username,
      //   password: password
      // });

      logger.warn(`Credenciales inválidas para usuario: ${username}`);
      return null;
    } catch (error) {
      logger.error("Error en autenticación Odoo:", error);
      throw new Error("Error de conexión con Odoo");
    }
  }

  /**
   * Obtiene información del usuario por ID
   */
  async getUserById(userId: number): Promise<OdooUser | null> {
    try {
      // SIMULACIÓN para desarrollo
      if (config.nodeEnv === "development") {
        const mockUsers: OdooUser[] = [
          {
            id: 1,
            login: "admin",
            name: "Administrador SELK",
            email: "admin@selk.com",
            active: true,
          },
          {
            id: 2,
            login: "operario1",
            name: "Juan Pérez",
            email: "operario1@selk.com",
            active: true,
          },
        ];

        return mockUsers.find((u) => u.id === userId) || null;
      }

      // TODO: Implementar llamada real a Odoo
      return null;
    } catch (error) {
      logger.error("Error obteniendo usuario de Odoo:", error);
      return null;
    }
  }

  /**
   * Sincroniza usuario desde Odoo a nuestra base de datos
   */
  async syncUserFromOdoo(odooUserId: number): Promise<boolean> {
    try {
      const odooUser = await this.getUserById(odooUserId);
      if (!odooUser) {
        return false;
      }

      // Aquí podríamos actualizar la información en nuestra base de datos
      logger.info(`Usuario sincronizado desde Odoo: ${odooUser.login}`);
      return true;
    } catch (error) {
      logger.error("Error sincronizando usuario desde Odoo:", error);
      return false;
    }
  }

  // Método privado para hacer llamadas a la API de Odoo (para implementar después)
  private async callOdooAPI(endpoint: string, data: any): Promise<any> {
    // TODO: Implementar cuando tengamos acceso a Odoo
    throw new Error("Conexión a Odoo no implementada aún");
  }
}
