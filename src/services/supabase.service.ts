// src/services/supabase.service.ts
import { supabaseClient, supabaseAdmin } from "../config/supabase";
import {
  UserApp,
  UserSession,
  AuditLog,
  UserPermissions,
} from "../types/auth.types";
import { logger } from "../utils/logger";

export class SupabaseService {
  /**
   * Buscar usuario por ID
   */
  async findUserById(userId: string): Promise<UserApp | null> {
    try {
      const { data, error } = await supabaseClient
        .from("users_app")
        .select("*")
        .eq("id", userId)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Error buscando usuario por ID:", error);
      throw error;
    }
  }
  /**
   * Buscar usuario por username
   */
  async findUserByUsername(username: string): Promise<UserApp | null> {
    try {
      const { data, error } = await supabaseClient
        .from("users_app")
        .select("*")
        .eq("username", username)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Error buscando usuario por username:", error);
      throw error;
    }
  }

  /**
   * Buscar usuario por ID de Odoo
   */
  async findUserByOdooId(odooUserId: number): Promise<UserApp | null> {
    try {
      const { data, error } = await supabaseClient
        .from("users_app")
        .select("*")
        .eq("odoo_user_id", odooUserId)
        .eq("is_active", true)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Error buscando usuario por Odoo ID:", error);
      throw error;
    }
  }

  /**
   * Crear nuevo usuario en la aplicación
   */
  async createUser(userData: {
    odoo_user_id: number;
    username: string;
    email: string;
    full_name: string;
    permissions?: UserPermissions;
  }): Promise<UserApp> {
    try {
      const defaultPermissions: UserPermissions = {
        colocacion: { read: true, write: false, admin: false },
        entrada: { read: true, write: false, admin: false },
        recogida: { read: true, write: false, admin: false },
      };

      const { data, error } = await supabaseClient
        .from("users_app")
        .insert({
          ...userData,
          permissions: userData.permissions || defaultPermissions,
          last_odoo_sync: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`Usuario creado: ${userData.username}`);
      return data;
    } catch (error) {
      logger.error("Error creando usuario:", error);
      throw error;
    }
  }

  /**
   * Actualizar última sincronización con Odoo
   */
  async updateLastOdooSync(userId: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from("users_app")
        .update({
          last_odoo_sync: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
    } catch (error) {
      logger.error("Error actualizando última sincronización:", error);
      throw error;
    }
  }

  /**
   * Crear nueva sesión de usuario
   */
  async createUserSession(sessionData: {
    user_id: string;
    device_identifier: string;
    refresh_token_hash: string;
    expires_at: string;
  }): Promise<UserSession> {
    try {
      // Primero, desactivar sesiones anteriores del mismo dispositivo
      await this.deactivateDeviceSessions(sessionData.device_identifier);

      const { data, error } = await supabaseClient
        .from("user_sessions")
        .insert(sessionData)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      logger.error("Error creando sesión:", error);
      throw error;
    }
  }

  /**
   * Buscar sesión por refresh token
   */
  async findSessionByRefreshToken(
    refreshTokenHash: string
  ): Promise<UserSession | null> {
    try {
      const { data, error } = await supabaseClient
        .from("user_sessions")
        .select("*")
        .eq("refresh_token_hash", refreshTokenHash)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data;
    } catch (error) {
      logger.error("Error buscando sesión por refresh token:", error);
      throw error;
    }
  }

  /**
   * Desactivar sesiones de un dispositivo
   */
  async deactivateDeviceSessions(deviceIdentifier: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from("user_sessions")
        .update({
          is_active: false,
          last_activity: new Date().toISOString(),
        })
        .eq("device_identifier", deviceIdentifier)
        .eq("is_active", true);

      if (error) throw error;
    } catch (error) {
      logger.error("Error desactivando sesiones del dispositivo:", error);
      throw error;
    }
  }

  /**
   * Desactivar sesión específica
   */
  async deactivateSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from("user_sessions")
        .update({
          is_active: false,
          last_activity: new Date().toISOString(),
        })
        .eq("id", sessionId);

      if (error) throw error;
    } catch (error) {
      logger.error("Error desactivando sesión:", error);
      throw error;
    }
  }

  /**
   * Actualizar actividad de sesión
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const { error } = await supabaseClient
        .from("user_sessions")
        .update({ last_activity: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("is_active", true);

      if (error) throw error;
    } catch (error) {
      logger.error("Error actualizando actividad de sesión:", error);
      // No lanzamos error aquí para no interrumpir la operación principal
    }
  }

  /**
   * Crear log de auditoría
   */
  async createAuditLog(logData: {
    user_id: string;
    action: string;
    device_identifier: string;
    ip_address?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const { error } = await supabaseClient.from("audit_logs").insert({
        ...logData,
        timestamp: new Date().toISOString(),
      });

      if (error) throw error;
    } catch (error) {
      logger.error("Error creando log de auditoría:", error);
      // No lanzamos error para no interrumpir la operación principal
    }
  }

  /**
   * Obtener logs de auditoría de un usuario
   */
  async getUserAuditLogs(
    userId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    try {
      const { data, error } = await supabaseClient
        .from("audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error("Error obteniendo logs de auditoría:", error);
      return [];
    }
  }

  /**
   * Limpiar sesiones expiradas
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc("cleanup_expired_sessions");

      if (error) throw error;

      logger.info("Sesiones expiradas limpiadas correctamente");
    } catch (error) {
      logger.error("Error limpiando sesiones expiradas:", error);
    }
  }

  /**
   * Forzar logout diario (para ejecutar a las 16:00)
   */
  async forceDailyLogout(): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc("force_daily_logout");

      if (error) throw error;

      logger.info("Logout diario forzado ejecutado correctamente");
    } catch (error) {
      logger.error("Error en logout diario forzado:", error);
    }
  }
}
