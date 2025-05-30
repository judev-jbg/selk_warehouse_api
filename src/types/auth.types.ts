// src/types/auth.types.ts
export interface UserPermissions {
  colocacion: {
    read: boolean;
    write: boolean;
    admin: boolean;
  };
  entrada: {
    read: boolean;
    write: boolean;
    admin: boolean;
  };
  recogida: {
    read: boolean;
    write: boolean;
    admin: boolean;
  };
}

export interface UserApp {
  id: string;
  odoo_user_id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  permissions: UserPermissions;
  created_at: string;
  updated_at: string;
  last_odoo_sync: string | null;
}

export interface UserSession {
  id: string;
  user_id: string;
  device_identifier: string;
  refresh_token_hash: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  last_activity: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  device_identifier: string;
  ip_address: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  device_identifier: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: Omit<UserApp, "created_at" | "updated_at" | "last_odoo_sync">;
  expires_at: string;
}
