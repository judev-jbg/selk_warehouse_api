// src/config/supabase.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "./index";

// Cliente con rol anónimo para operaciones básicas
export const supabaseClient = createClient(
  config.supabase.url,
  config.supabase.anonKey
);

// Cliente con rol de servicio para operaciones administrativas
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// Función para verificar la conexión a Supabase
export const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabaseClient
      .from("users_app")
      .select("count")
      .limit(1);

    return !error;
  } catch (error) {
    console.error("Error conectando a Supabase:", error);
    return false;
  }
};
