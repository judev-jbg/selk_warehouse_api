import dotenv from "dotenv";
import path from "path";

// Cargar variables de entorno desde .env
dotenv.config();

interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

// Establecer valores por defecto
const env: EnvironmentVariables = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000", 10),
  JWT_SECRET: process.env.JWT_SECRET || "selk-warehouse-secret-key",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: parseInt(process.env.DB_PORT || "1433", 10), // Puerto por defecto SQL Server
  DB_USER: process.env.DB_USER || "sa",
  DB_PASSWORD: process.env.DB_PASSWORD || "Password123!",
  DB_NAME: process.env.DB_NAME || "selk_warehouse",
};

export default env;
