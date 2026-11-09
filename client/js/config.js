// Supabase bağlantısı (yayınlanabilir anahtar — tarayıcıda görünmesi normaldir; yetkiler RLS ile korunur)
// Yerel kurulum (KO-YEREL paketi): site localhost'tan açılınca bilgisayardaki Supabase'e (supabase start, 127.0.0.1:54321) bağlanır.
//   Anahtar: Supabase CLI'nin herkese açık yerel "anon" anahtarı; farklıysa tarayıcı konsolunda localStorage.setItem('ko-yerel-key', '<anahtar>').
const YEREL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const YEREL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const yerelAyar = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const SUPABASE_URL = YEREL ? (yerelAyar('ko-yerel-url') || 'http://127.0.0.1:54321') : 'https://vnlevnlsyyqkofnplzdm.supabase.co';
export const SUPABASE_KEY = YEREL ? (yerelAyar('ko-yerel-key') || YEREL_ANON) : 'sb_publishable_gbSRPMiyaTwUSxD9gwcHvA_l-S_MkzH';
export const YEREL_KURULUM = YEREL;
