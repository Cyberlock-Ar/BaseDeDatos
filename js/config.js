// ============================================================
//  CONFIGURACIÓN DE SUPABASE
//  Reemplaza las dos líneas de abajo con los datos de TU proyecto:
//  Supabase > Project Settings > API
// ============================================================

const SUPABASE_URL = "https://asusrgeulwqishuewapu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdXNyZ2V1bHdxaXNodWV3YXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MDIzMjIsImV4cCI6MjEwODI3ODMyMn0.4His4v-nDa7CmgWi0EPyFhKbIpKuBMn2-pYEOEhEIaU";

// No tocar nada de abajo
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
