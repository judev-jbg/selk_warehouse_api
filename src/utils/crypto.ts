// src/utils/crypto.util.ts (versión simplificada)
import { config } from "../config/index";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";

export const hashUtils = {
  // Hash para contraseñas (aunque las validaremos contra Odoo)
  hashPassword: async (password: string): Promise<string> => {
    return bcrypt.hash(password, config.security.bcryptRounds);
  },

  // Verificar contraseña
  verifyPassword: async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash);
  },

  // Hash para refresh tokens
  hashRefreshToken: (token: string): string => {
    return createHash("sha256").update(token).digest("hex");
  },

  // Generar device identifier único
  generateDeviceHash: (deviceInfo: string): string => {
    return createHash("sha256")
      .update(deviceInfo + config.security.deviceSecret)
      .digest("hex");
  },
};

export const jwtUtils = {
  // Generar access token
  generateAccessToken: (payload: any): string => {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expireTime,
    });
  },

  // Generar refresh token
  generateRefreshToken: (payload: any): string => {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpireTime,
    });
  },

  // Verificar access token
  verifyAccessToken: (token: string): any => {
    return jwt.verify(token, config.jwt.secret);
  },

  // Verificar refresh token
  verifyRefreshToken: (token: string): any => {
    return jwt.verify(token, config.jwt.refreshSecret);
  },
};
