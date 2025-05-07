import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.model";
import env from "../config/environment";
import logger from "../utils/logger";

// Interfaz para la solicitud de login
interface LoginRequest {
  username: string;
  password: string;
}

// Controlador de autenticación
const authController = {
  /**
   * Iniciar sesión de usuario
   */
  login: async (req: Request, res: Response): Promise<Response> => {
    try {
      const { username, password } = req.body as LoginRequest;

      // Buscar usuario por nombre de usuario
      const user = await User.findOne({ where: { username } });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Verificar contraseña
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
      }

      // Generar token JWT
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          roles: user.roles,
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      // Generar refresh token (implementación básica)
      const refreshToken = jwt.sign({ id: user.id }, env.JWT_SECRET, {
        expiresIn: "7d",
      });

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          name: user.name,
          roles: user.roles,
          token,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Error en login:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  },

  /**
   * Cerrar sesión de usuario
   */
  logout: async (req: Request, res: Response): Promise<Response> => {
    try {
      // En una implementación completa, aquí se invalidaría el token
      // Por ahora, simplemente retornamos éxito
      return res.status(200).json({
        success: true,
        message: "Sesión cerrada correctamente",
      });
    } catch (error) {
      logger.error("Error en logout:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  },

  /**
   * Validar token de usuario
   */
  validateToken: async (req: Request, res: Response): Promise<Response> => {
    try {
      // El middleware auth.middleware ya validó el token
      // Simplemente retornamos éxito
      return res.status(200).json({
        success: true,
        message: "Token válido",
      });
    } catch (error) {
      logger.error("Error en validateToken:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor",
      });
    }
  },
};

export default authController;
