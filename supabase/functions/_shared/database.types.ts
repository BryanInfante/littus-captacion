export type Json = string | number | boolean | null | {
  [key: string]: Json | undefined;
} | Json[];

export type Database = {
  "graphql_public": {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      "graphql": {
        Args: {
          "extensions"?: Json;
          "operationName"?: string;
          "query"?: string;
          "variables"?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  "public": {
    Tables: {
      "eccia_eventos": {
        Row: {
          "activo": boolean;
          "codigo_prefijo": string;
          "creado_en": string;
          "descripcion": string | null;
          "duracion": string | null;
          "event_title": string;
          "event_title_linea_1": string | null;
          "event_title_linea_2": string | null;
          "fecha_evento": string | null;
          "fecha_texto": string | null;
          "inscripcion_abre_en": string | null;
          "inscripcion_cierra_en": string | null;
          "masterclass_codigo": string;
          "nextcloud_directorio": string | null;
          "resumen": string | null;
          "tipo": string | null;
        };
        ComputedFields: never;
        Insert: {
          "activo"?: boolean;
          "codigo_prefijo": string;
          "creado_en"?: string;
          "descripcion"?: string | null;
          "duracion"?: string | null;
          "event_title": string;
          "event_title_linea_1"?: string | null;
          "event_title_linea_2"?: string | null;
          "fecha_evento"?: string | null;
          "fecha_texto"?: string | null;
          "inscripcion_abre_en"?: string | null;
          "inscripcion_cierra_en"?: string | null;
          "masterclass_codigo": string;
          "nextcloud_directorio"?: string | null;
          "resumen"?: string | null;
          "tipo"?: string | null;
        };
        Update: {
          "activo"?: boolean;
          "codigo_prefijo"?: string;
          "creado_en"?: string;
          "descripcion"?: string | null;
          "duracion"?: string | null;
          "event_title"?: string;
          "event_title_linea_1"?: string | null;
          "event_title_linea_2"?: string | null;
          "fecha_evento"?: string | null;
          "fecha_texto"?: string | null;
          "inscripcion_abre_en"?: string | null;
          "inscripcion_cierra_en"?: string | null;
          "masterclass_codigo"?: string;
          "nextcloud_directorio"?: string | null;
          "resumen"?: string | null;
          "tipo"?: string | null;
        };
        Relationships: [];
      };
      "eccia_limites_solicitud": {
        Row: {
          "clave_hash": string;
          "intentos": number;
          "vence_en": string;
        };
        ComputedFields: never;
        Insert: {
          "clave_hash": string;
          "intentos": number;
          "vence_en": string;
        };
        Update: {
          "clave_hash"?: string;
          "intentos"?: number;
          "vence_en"?: string;
        };
        Relationships: [];
      };
      "eccia_masterclass_certificados": {
        Row: {
          "certificate_attempts": number;
          "certificate_emailed_at": string | null;
          "certificate_error": string | null;
          "certificate_generated_at": string | null;
          "certificate_rendering_started_at": string | null;
          "certificate_resend_email_id": string | null;
          "certificate_status": string;
          "certificate_uploaded_at": string | null;
          "codigo_certificado": string | null;
          "correo": string;
          "creado_en": string;
          "id": string;
          "masterclass_codigo": string;
          "nextcloud_path": string | null;
          "nombre_completo": string;
          "public_certificate_url": string | null;
          "registration_id": string | null;
          "validation_url": string | null;
        };
        ComputedFields: never;
        Insert: {
          "certificate_attempts"?: number;
          "certificate_emailed_at"?: string | null;
          "certificate_error"?: string | null;
          "certificate_generated_at"?: string | null;
          "certificate_rendering_started_at"?: string | null;
          "certificate_resend_email_id"?: string | null;
          "certificate_status"?: string;
          "certificate_uploaded_at"?: string | null;
          "codigo_certificado"?: string | null;
          "correo": string;
          "creado_en"?: string;
          "id"?: string;
          "masterclass_codigo"?: string;
          "nextcloud_path"?: string | null;
          "nombre_completo": string;
          "public_certificate_url"?: string | null;
          "registration_id"?: string | null;
          "validation_url"?: string | null;
        };
        Update: {
          "certificate_attempts"?: number;
          "certificate_emailed_at"?: string | null;
          "certificate_error"?: string | null;
          "certificate_generated_at"?: string | null;
          "certificate_rendering_started_at"?: string | null;
          "certificate_resend_email_id"?: string | null;
          "certificate_status"?: string;
          "certificate_uploaded_at"?: string | null;
          "codigo_certificado"?: string | null;
          "correo"?: string;
          "creado_en"?: string;
          "id"?: string;
          "masterclass_codigo"?: string;
          "nextcloud_path"?: string | null;
          "nombre_completo"?: string;
          "public_certificate_url"?: string | null;
          "registration_id"?: string | null;
          "validation_url"?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "eccia_masterclass_certificados_evento_fkey";
            columns: ["masterclass_codigo"];
            isOneToOne: false;
            referencedRelation: "eccia_eventos";
            referencedColumns: ["masterclass_codigo"];
          },
          {
            foreignKeyName: "eccia_masterclass_certificados_evento_fkey";
            columns: ["masterclass_codigo"];
            isOneToOne: false;
            referencedRelation: "eccia_eventos_publicos";
            referencedColumns: ["masterclass_codigo"];
          },
          {
            foreignKeyName:
              "eccia_masterclass_certificados_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "eccia_taller_inscripciones";
            referencedColumns: ["id"];
          },
        ];
      };
      "eccia_taller_inscripciones": {
        Row: {
          "confirmation_error": string | null;
          "confirmation_resend_email_id": string | null;
          "confirmation_sent_at": string | null;
          "correo": string;
          "creado_en": string;
          "id": string;
          "marketing_consent": boolean;
          "marketing_consented_at": string | null;
          "nombre": string;
          "resend_contact_id": string | null;
          "resend_sync_error": string | null;
          "resend_synced_at": string | null;
          "taller_codigo": string;
        };
        ComputedFields: never;
        Insert: {
          "confirmation_error"?: string | null;
          "confirmation_resend_email_id"?: string | null;
          "confirmation_sent_at"?: string | null;
          "correo": string;
          "creado_en"?: string;
          "id"?: string;
          "marketing_consent"?: boolean;
          "marketing_consented_at"?: never;
          "nombre": string;
          "resend_contact_id"?: string | null;
          "resend_sync_error"?: string | null;
          "resend_synced_at"?: string | null;
          "taller_codigo": string;
        };
        Update: {
          "confirmation_error"?: string | null;
          "confirmation_resend_email_id"?: string | null;
          "confirmation_sent_at"?: string | null;
          "correo"?: string;
          "creado_en"?: string;
          "id"?: string;
          "marketing_consent"?: boolean;
          "marketing_consented_at"?: never;
          "nombre"?: string;
          "resend_contact_id"?: string | null;
          "resend_sync_error"?: string | null;
          "resend_synced_at"?: string | null;
          "taller_codigo"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "eccia_taller_inscripciones_evento_fkey";
            columns: ["taller_codigo"];
            isOneToOne: false;
            referencedRelation: "eccia_eventos";
            referencedColumns: ["masterclass_codigo"];
          },
          {
            foreignKeyName: "eccia_taller_inscripciones_evento_fkey";
            columns: ["taller_codigo"];
            isOneToOne: false;
            referencedRelation: "eccia_eventos_publicos";
            referencedColumns: ["masterclass_codigo"];
          },
        ];
      };
    };
    Views: {
      "eccia_eventos_publicos": {
        Row: {
          "duracion": string | null;
          "event_title": string | null;
          "fecha_evento": string | null;
          "fecha_texto": string | null;
          "inscripcion_abre_en": string | null;
          "inscripcion_cierra_en": string | null;
          "masterclass_codigo": string | null;
          "resumen": string | null;
          "tipo": string | null;
        };
        ComputedFields: never;
        Insert: {
          "duracion"?: string | null;
          "event_title"?: string | null;
          "fecha_evento"?: string | null;
          "fecha_texto"?: string | null;
          "inscripcion_abre_en"?: string | null;
          "inscripcion_cierra_en"?: string | null;
          "masterclass_codigo"?: string | null;
          "resumen"?: string | null;
          "tipo"?: string | null;
        };
        Update: {
          "duracion"?: string | null;
          "event_title"?: string | null;
          "fecha_evento"?: string | null;
          "fecha_texto"?: string | null;
          "inscripcion_abre_en"?: string | null;
          "inscripcion_cierra_en"?: string | null;
          "masterclass_codigo"?: string | null;
          "resumen"?: string | null;
          "tipo"?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      "eccia_consumir_limite": {
        Args: {
          "p_clave_hash": string;
          "p_limite": number;
          "p_ventana_segundos": number;
        };
        Returns: {
          "allowed": boolean;
          "retry_after_seconds": number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema =
  DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof (
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
        "Tables"
      ]
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
        "Views"
      ]
    )
    : never = never,
> = DefaultSchemaTableNameOrOptions extends
  { schema: keyof DatabaseWithoutInternals } ? (
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Views"
    ]
  )[TableName] extends {
    Row: infer R;
  } ? R
  : never
  : DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[
      DefaultSchemaTableNameOrOptions
    ] extends {
      Row: infer R;
    } ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends
  { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
    "Tables"
  ][TableName] extends {
    Insert: infer I;
  } ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    } ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends
  { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
    "Tables"
  ][TableName] extends {
    Update: infer U;
  } ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    } ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]][
      "Enums"
    ]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends
  { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][
    EnumName
  ]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[
      PublicCompositeTypeNameOrOptions["schema"]
    ]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends
  { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]][
    "CompositeTypes"
  ][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  "graphql_public": {
    Enums: {},
  },
  "public": {
    Enums: {},
  },
} as const;
