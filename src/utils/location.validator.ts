// src/utils/location.validator.ts
import { AppError } from "../middlewares/error.middleware";

export class LocationValidator {
  // Regex para formato de ubicación: Letra + 2 dígitos + dígito 0-5
  private static readonly LOCATION_REGEX = /^[A-Z]\d{2}[0-5]$/;

  /**
   * Validar formato de ubicación
   */
  public static validate(location: string): boolean {
    if (!location || typeof location !== "string") {
      return false;
    }

    return this.LOCATION_REGEX.test(location.trim().toUpperCase());
  }

  /**
   * Limpiar y formatear ubicación
   */
  public static clean(location: string): string {
    if (!location || typeof location !== "string") {
      return "";
    }

    return location.trim().toUpperCase();
  }

  /**
   * Validar y limpiar ubicación
   */
  public static validateAndClean(location: string): string {
    const cleanedLocation = this.clean(location);

    if (!this.validate(cleanedLocation)) {
      throw new AppError(
        "Formato de ubicación inválido. Debe ser: Letra + 2 dígitos + altura (0-5). Ejemplo: A213",
        400
      );
    }

    return cleanedLocation;
  }

  /**
   * Extraer componentes de la ubicación
   */
  public static parseLocation(location: string): {
    aisle: string;
    block: string;
    level: number;
  } {
    const cleanedLocation = this.validateAndClean(location);

    return {
      aisle: cleanedLocation[0], // Primera letra
      block: cleanedLocation.substring(1, 3), // Dos dígitos
      level: parseInt(cleanedLocation[3]), // Último dígito (0-5)
    };
  }

  /**
   * Construir ubicación desde componentes
   */
  public static buildLocation(
    aisle: string,
    block: string,
    level: number
  ): string {
    // Validar componentes
    if (!/^[A-Z]$/.test(aisle)) {
      throw new AppError("El pasillo debe ser una letra mayúscula (A-Z)", 400);
    }

    if (!/^\d{2}$/.test(block)) {
      throw new AppError("El bloque debe ser de 2 dígitos (00-99)", 400);
    }

    if (level < 0 || level > 5) {
      throw new AppError("El nivel debe estar entre 0 y 5", 400);
    }

    const location = `${aisle}${block}${level}`;
    return this.validateAndClean(location);
  }

  /**
   * Obtener ubicaciones adyacentes
   */
  public static getAdjacentLocations(location: string): string[] {
    const { aisle, block, level } = this.parseLocation(location);
    const adjacent: string[] = [];

    // Niveles adyacentes en el mismo bloque
    if (level > 0) {
      adjacent.push(`${aisle}${block}${level - 1}`);
    }
    if (level < 5) {
      adjacent.push(`${aisle}${block}${level + 1}`);
    }

    return adjacent;
  }
}
