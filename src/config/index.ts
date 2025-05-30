// src/config/index.ts
import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  apiVersion: process.env.API_VERSION || "v1",

  jwt: {
    secret: process.env.JWT_SECRET || "fallback_secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret",
    expireTime: process.env.JWT_EXPIRE_TIME || "2h",
    refreshExpireTime: process.env.JWT_REFRESH_EXPIRE_TIME || "24h",
  },

  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },

  odoo: {
    url: process.env.ODOO_URL || "http://localhost:8069",
    database: process.env.ODOO_DATABASE || "odoo",
    username: process.env.ODOO_USERNAME || "admin",
    password: process.env.ODOO_PASSWORD || "admin",
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12"),
    deviceSecret: process.env.DEVICE_SECRET || "device_secret",
  },

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
  },
};
