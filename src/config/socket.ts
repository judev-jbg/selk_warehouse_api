import { Server } from "socket.io";
import http from "http";
import jwt from "jsonwebtoken";
import env from "./environment";
import logger from "../utils/logger";

// Tipo de eventos WebSocket
enum WSEventType {
  SCAN = "scan",
  LABEL_PRINT = "labelPrint",
  LOCATION_UPDATE = "locationUpdate",
  STOCK_UPDATE = "stockUpdate",
  DELIVERY_NOTE = "deliveryNote",
  ERROR = "error",
}

// Interfaz para eventos WebSocket
interface WSEvent {
  type: WSEventType;
  data: any;
}

// Configuración del servidor WebSocket
const configureSocketServer = (server: http.Server): Server => {
  const io = new Server(server, {
    cors: {
      origin: "*", // En producción, configurar para orígenes específicos
      methods: ["GET", "POST"],
    },
  });

  // Middleware para autenticación de WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.query.token as string;

    if (!token) {
      return next(new Error("Token no proporcionado"));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      // @ts-ignore
      socket.user = decoded;
      next();
    } catch (error) {
      return next(new Error("Token inválido"));
    }
  });

  // Evento de conexión
  io.on("connection", (socket) => {
    logger.info(`Cliente WebSocket conectado: ${socket.id}`);

    // Evento de mensaje recibido
    socket.on("message", (data: string) => {
      try {
        // Si es un ping, respondemos con pong
        if (data === "ping") {
          socket.emit("message", "pong");
          return;
        }

        const event: WSEvent = JSON.parse(data);
        logger.debug(`Evento recibido: ${event.type}`, event.data);

        // Procesar evento según su tipo
        switch (event.type) {
          case WSEventType.SCAN:
            // Broadcast del evento a todos los clientes conectados
            io.emit("message", JSON.stringify(event));
            break;
          case WSEventType.LOCATION_UPDATE:
            io.emit("message", JSON.stringify(event));
            break;
          case WSEventType.STOCK_UPDATE:
            io.emit("message", JSON.stringify(event));
            break;
          case WSEventType.LABEL_PRINT:
            io.emit("message", JSON.stringify(event));
            break;
          case WSEventType.DELIVERY_NOTE:
            io.emit("message", JSON.stringify(event));
            break;
          default:
            logger.warn(`Tipo de evento desconocido: ${event.type}`);
            break;
        }
      } catch (error) {
        logger.error("Error al procesar mensaje WebSocket:", error);
        socket.emit(
          "message",
          JSON.stringify({
            type: WSEventType.ERROR,
            data: { message: "Error al procesar el mensaje" },
          })
        );
      }
    });

    // Evento de desconexión
    socket.on("disconnect", () => {
      logger.info(`Cliente WebSocket desconectado: ${socket.id}`);
    });
  });

  return io;
};

export default configureSocketServer;
