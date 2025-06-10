// src/utils/barcode.validator.ts
import { AppError } from "../middlewares/error.middleware";

export class BarcodeValidator {
  // Regex para EAN13 (13 dígitos)
  private static readonly EAN13_REGEX = /^[0-9]{13}$/;

  // Regex para DUN14 (14 dígitos)
  private static readonly DUN14_REGEX = /^[0-9]{14}$/;

  /**
   * Validar formato de código de barras EAN13 o DUN14
   */
  public static validate(barcode: string): boolean {
    if (!barcode || typeof barcode !== "string") {
      return false;
    }

    const cleanBarcode = barcode.trim();

    return (
      this.EAN13_REGEX.test(cleanBarcode) || this.DUN14_REGEX.test(cleanBarcode)
    );
  }

  /**
   * Limpiar código de barras (remover sufijos como \n, \t)
   */
  public static clean(barcode: string): string {
    if (!barcode || typeof barcode !== "string") {
      return "";
    }

    return barcode.replace(/[\n\t\r\s]/g, "").trim();
  }

  /**
   * Validar y limpiar código de barras
   */
  public static validateAndClean(barcode: string): string {
    const cleanedBarcode = this.clean(barcode);

    if (!this.validate(cleanedBarcode)) {
      throw new AppError(
        "Código de barras inválido. Debe ser EAN13 (13 dígitos) o DUN14 (14 dígitos)",
        400
      );
    }

    return cleanedBarcode;
  }

  /**
   * Detectar tipo de código de barras
   */
  public static detectType(barcode: string): "EAN13" | "DUN14" | "INVALID" {
    const cleanBarcode = this.clean(barcode);

    if (this.EAN13_REGEX.test(cleanBarcode)) {
      return "EAN13";
    }

    if (this.DUN14_REGEX.test(cleanBarcode)) {
      return "DUN14";
    }

    return "INVALID";
  }

  /**
   * Calcular dígito de verificación EAN13
   */
  public static calculateEAN13CheckDigit(barcode: string): number {
    if (barcode.length !== 12) {
      throw new AppError(
        "EAN13 debe tener 12 dígitos para calcular el dígito de verificación",
        400
      );
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(barcode[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }

    const remainder = sum % 10;
    return remainder === 0 ? 0 : 10 - remainder;
  }

  /**
   * Validar dígito de verificación EAN13
   */
  public static validateEAN13CheckDigit(barcode: string): boolean {
    if (barcode.length !== 13) {
      return false;
    }

    const checkDigit = parseInt(barcode[12]);
    const calculatedCheckDigit = this.calculateEAN13CheckDigit(
      barcode.substring(0, 12)
    );

    return checkDigit === calculatedCheckDigit;
  }
}
