// src/utils/crypto.util.ts
import bcrypt from "bcryptjs";
import { config } from "../config";
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
      issuer: "selk-warehouse-api",
      audience: "selk-warehouse-app",
    });
  },

  // Generar refresh token
  generateRefreshToken: (payload: any): string => {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpireTime,
      issuer: "selk-warehouse-api",
      audience: "selk-warehouse-app",
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
