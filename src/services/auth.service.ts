// src/services/auth.service.ts
import { OdooService } from "./odoo.service";
import { SupabaseService } from "./supabase.service";
import { hashUtils, jwtUtils } from "../utils/crypto";
import { logger, auditLogger } from "../utils/logger";
import { UserApp, LoginRequest, LoginResponse } from "../types/auth.types";
import { AppError } from "../middlewares/error.middleware";

export class AuthService {
  private odooService: OdooService;
  private supabaseService: SupabaseService;

  constructor() {
    this.odooService = new OdooService();
    this.supabaseService = new SupabaseService();
  }

  /**
   * Autenticar usuario y crear sesión
   */
  async login(
    loginData: LoginRequest,
    ipAddress: string
  ): Promise<LoginResponse> {
    try {
      const { username, password, device_identifier } = loginData;

      // 1. Autenticar contra Odoo
      const odooUser = await this.odooService.authenticateUser(
        username,
        password
      );
      if (!odooUser) {
        throw new AppError("Credenciales inválidas", 401);
      }

      // 2. Buscar o crear usuario en nuestra base de datos
      let appUser = await this.supabaseService.findUserByOdooId(odooUser.id);

      if (!appUser) {
        // Crear usuario si no existe
        appUser = await this.supabaseService.createUser({
          odoo_user_id: odooUser.id,
          username: odooUser.login,
          email: odooUser.email,
          full_name: odooUser.name,
        });
      } else {
        // Actualizar última sincronización
        await this.supabaseService.updateLastOdooSync(appUser.id);
      }

      // 3. Calcular fecha de expiración (16:00 del día siguiente)
      const expiresAt = this.calculateNextExpiration();

      // 4. Generar tokens
      const tokenPayload = {
        userId: appUser.id,
        username: appUser.username,
        odooUserId: appUser.odoo_user_id,
        permissions: appUser.permissions,
        deviceId: device_identifier,
      };

      const accessToken = jwtUtils.generateAccessToken(tokenPayload);
      const refreshToken = jwtUtils.generateRefreshToken({
        userId: appUser.id,
        deviceId: device_identifier,
      });

      // 5. Guardar sesión
      const refreshTokenHash = hashUtils.hashRefreshToken(refreshToken);
      await this.supabaseService.createUserSession({
        user_id: appUser.id,
        device_identifier,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt.toISOString(),
      });

      // 6. Crear log de auditoría
      await this.supabaseService.createAuditLog({
        user_id: appUser.id,
        action: "login",
        device_identifier,
        ip_address: ipAddress,
        metadata: {
          login_method: "odoo_credentials",
          user_agent: "PDA",
        },
      });

      auditLogger.login(appUser.id, device_identifier, ipAddress);

      // 7. Preparar respuesta (sin datos sensibles)
      const { created_at, updated_at, last_odoo_sync, ...userResponse } =
        appUser;

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: userResponse,
        expires_at: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error("Error en login:", error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Error interno durante el login", 500);
    }
  }

  /**
   * Refrescar token de acceso
   */
  async refreshToken(
    refreshToken: string,
    deviceIdentifier: string
  ): Promise<{ access_token: string }> {
    try {
      // 1. Verificar refresh token
      const decoded = jwtUtils.verifyRefreshToken(refreshToken);

      // 2. Buscar sesión en base de datos
      const refreshTokenHash = hashUtils.hashRefreshToken(refreshToken);
      const session = await this.supabaseService.findSessionByRefreshToken(
        refreshTokenHash
      );

      if (!session || session.device_identifier !== deviceIdentifier) {
        throw new AppError("Refresh token inválido", 401);
      }

      // 3. Verificar que no haya expirado
      if (new Date(session.expires_at) < new Date()) {
        await this.supabaseService.deactivateSession(session.id);
        throw new AppError("Sesión expirada", 401);
      }

      // 4. Buscar usuario
      const user = await this.supabaseService.findUserByOdooId(decoded.userId);
      if (!user || !user.is_active) {
        throw new AppError("Usuario no encontrado o inactivo", 401);
      }

      // 5. Generar nuevo access token
      const tokenPayload = {
        userId: user.id,
        username: user.username,
        odooUserId: user.odoo_user_id,
        permissions: user.permissions,
        deviceId: deviceIdentifier,
      };

      const newAccessToken = jwtUtils.generateAccessToken(tokenPayload);

      // 6. Actualizar actividad de sesión
      await this.supabaseService.updateSessionActivity(session.id);

      return {
        access_token: newAccessToken,
      };
    } catch (error) {
      logger.error("Error refrescando token:", error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Error interno refrescando token", 500);
    }
  }

  /**
   * Cerrar sesión
   */
  async logout(userId: string, deviceIdentifier: string): Promise<void> {
    try {
      // 1. Desactivar sesiones del dispositivo
      await this.supabaseService.deactivateDeviceSessions(deviceIdentifier);

      // 2. Crear log de auditoría
      await this.supabaseService.createAuditLog({
        user_id: userId,
        action: "logout",
        device_identifier: deviceIdentifier,
        metadata: {
          logout_type: "manual",
        },
      });

      auditLogger.logout(userId, deviceIdentifier);
    } catch (error) {
      logger.error("Error en logout:", error);
      throw new AppError("Error interno durante el logout", 500);
    }
  }

  /**
   * Obtener perfil del usuario
   */
  async getProfile(userId: string): Promise<UserApp> {
    try {
      const user = await this.supabaseService.findUserByUsername(userId);
      if (!user) {
        throw new AppError("Usuario no encontrado", 404);
      }

      return user;
    } catch (error) {
      logger.error("Error obteniendo perfil:", error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Error interno obteniendo perfil", 500);
    }
  }

  /**
   * Verificar token de acceso
   */
  async verifyAccessToken(token: string): Promise<any> {
    try {
      return jwtUtils.verifyAccessToken(token);
    } catch (error) {
      throw new AppError("Token inválido", 401);
    }
  }

  /**
   * Calcular próxima fecha de expiración (16:00 del día siguiente)
   */
  private calculateNextExpiration(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(16, 0, 0, 0); // 16:00:00
    return tomorrow;
  }
}
