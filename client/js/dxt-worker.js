// Mip zinciri üretimini ana iş parçacığından alır (yükleme sırasında takılma olmasın).
import { joinDXT, buildMipChain } from './dxt.js';
self.onmessage = (e) => {
  const { id, data, fmt, w, h, split, punch, cutoff, keep } = e.data;
  const top = split ? joinDXT(new Uint8Array(data), fmt) : new Uint8Array(data);
  const lv = buildMipChain(top, fmt, w, h, { punch, cutoff });
  const out = lv.slice(0, keep || lv.length);
  self.postMessage({ id, levels: out }, out.map((l) => l.data.buffer).filter((b, i, a) => a.indexOf(b) === i));
};
