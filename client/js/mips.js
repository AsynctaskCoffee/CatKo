// Worker havuzu: DXT üst seviyesi → tam mip zinciri.
// Worker açılamaz ya da hata verirse (eski tarayıcı, CSP, modül worker desteği yok) iş ana iş parçacığında yapılır;
// hiçbir iş sonsuza kadar beklemez.
import { joinDXT, buildMipChain } from './dxt.js';

let pool = null, seq = 0; const waiting = new Map();
const local = (j) => buildMipChain(j.split ? joinDXT(j.data, j.fmt) : j.data, j.fmt, j.w, j.h, { punch: j.punch, cutoff: j.cutoff });

function failWorker(w) {
  if (w.dead) return; w.dead = true;
  try { w.terminate(); } catch {}
  // bu worker'a verilmiş bekleyen işleri yerelde bitir
  for (const [id, j] of waiting) if (j.wk === w) { waiting.delete(id); try { j.res(local(j)); } catch (e) { j.rej(e); } }
}
function getPool() {
  if (pool !== null) return pool;
  pool = [];
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./dxt-worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (e) => { const j = waiting.get(e.data.id); if (!j) return; waiting.delete(e.data.id); w.busy--; j.res(e.data.levels); };
      w.onerror = w.onmessageerror = () => failWorker(w);
      pool.push(w);
    }
  } catch { pool = []; }
  return pool;
}

/**
 * data: üst seviye (split ise akışlara ayrılmış). Kopyalanır, orijinal tampon dokunulmaz.
 * Dönen Promise<[{data,width,height}]>
 */
export function mipChain(data, fmt, w, h, { split = false, punch = false, cutoff = 0 } = {}) {
  const job = { data, fmt, w, h, split, punch, cutoff };
  const p = getPool().filter((x) => !x.dead);
  if (!p.length) return Promise.resolve(local(job));
  const wk = p.reduce((a, b) => (b.busy < a.busy ? b : a)); wk.busy++;
  const id = ++seq, copy = data.slice();
  return new Promise((res, rej) => {
    waiting.set(id, { ...job, wk, res, rej });
    try { wk.postMessage({ id, data: copy.buffer, fmt, w, h, split, punch, cutoff }, [copy.buffer]); }
    catch { failWorker(wk); }
    // güvenlik: 60 sn içinde yanıt yoksa worker'ı bırak
    setTimeout(() => { if (waiting.has(id)) failWorker(wk); }, 60000);
  });
}
