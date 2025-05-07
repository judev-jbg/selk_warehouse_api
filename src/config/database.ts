import { Sequelize } from "sequelize";
import env from "./environment";
import logger from "../utils/logger";

// Configuración de la conexión a la base de datos
const sequelize = new Sequelize({
  dialect: "mssql",
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  logging: (msg) => logger.debug(msg),
  dialectOptions: {
    options: {
      encrypt: true, // Para conexiones Azure SQL
      trustServerCertificate: env.NODE_ENV !== "production", // Para desarrollo local
    },
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Función para probar la conexión a la base de datos
export const testConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info("Conexión a la base de datos establecida correctamente");
  } catch (error) {
    logger.error("Error al conectar a la base de datos:", error);
    throw error;
  }
};

export default sequelize;
