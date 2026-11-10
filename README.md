# KO Web (MineKO)

Tarayıcıda Knight Online. `client/` hazır derlenmiş istemci (HTML/JS/CSS/asset), oyun verisi ve giriş **Supabase**'de (istemci doğrudan bağlanır).

    npm run build    # client/ → dist/  (sürüm damgası + ko-manifest.json)
    npm start        # dist/ sunar → http://localhost:8080   (PORT=3000 ile değiştir)
    npm run dev      # client/ doğrudan, build'siz

Bağımlılık yok (Node >= 18). HTML'lerdeki `__SURUM__` build'de yeni sürümle değişir.

## GitHub Pages
1. GitHub'da yeni repo aç, bu klasörün içeriğini `main` dalına push'la.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Push sonrası `.github/workflows/pages.yml` build alıp yayınlar → `https://KULLANICI.github.io/REPO/`
4. Supabase → Authentication → URL Configuration: bu adresi Site URL / Redirect URLs'e ekle.

## Demo modu (Supabase'siz)
Varsayılan olarak oyun hiçbir dış sunucuya bağlanmaz: `client/vendor/ko-demo.js` Supabase istemcisini tarayıcı içi sahte bir arka uçla değiştirir
(hesaplar/karakterler localStorage'da, `ko-demo-rpc.js` RPC'leri). Haritalar/NPC modelleri/müzik zip'te olmadığı için `build.mjs` düz bir yedek
Moradon haritası üretir. Gerçek harita dosyaları `client/zones/<bölge>/` altına konursa onlar kullanılır.
- Gerçek Supabase'e dönmek: adrese `?gercek=1` ekle (veya `localStorage.setItem('ko-gercek','1')`)
- Demo verisini sıfırlamak: konsolda `KO_DEMO_RESET()`
- Eksik RPC'leri görmek: `localStorage.setItem('ko-demo-log','1')`
