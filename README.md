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
- Demo arka ucu `vendor/ko-demo-oyun.js`: gerçek canavar/spawn/drop verisi (assets/mob-db), eşyalar (assets/esya), görevler (assets/gorev) ile
  savaş, exp/seviye, loot, envanter/kuşanma, iksirler, mağaza (shop_list/buy/sell), görevler (al/öldürme sayacı/teslim), beceriler (skill_use).
  Canavarlar seviyeye göre başlangıç noktası çevresinde halkalar halinde doğar (düşük seviye yakın). Yalnızca tek oyunculu.
- Eksik RPC'leri görmek: `localStorage.setItem('ko-demo-log','1')`

## CatKo: botlar, PK, CZ, bedava pazar

Demo modunda dünya tek başına canlıdır. `client/vendor/ko-demo-bot.js` gerçek çok oyunculu protokolü (meta/pos/hp/pvp/chat/anim) tarayıcı içinde taklit eder; oyun botları sıradan oyuncu gibi görür.

- **Moradon**: 6 arena düellocusu (iki arena serbest PK), 8 bot pazar tezgâhı (hepsi bedava), 7 gezgin/sohbet eden bot.
- **CZ (Chaos Zone) = Ardream (`freezone_a`)**: her ulustan 9 bot. Devriye, hedef seçimi (yakın/zayıf/düşük canlı), yaralanınca kaçış + pot, az kalınca gruba dönüş, rahip iyileştirmesi, kapıda spawn-camp yok, 8 sn'de diriliş. Oyuncu bölgesine kayarlar, böylece savaş çıkar.
- Oyuncu botlara `pvp_attack`/`pvp_skill` ile vurur (exp, NP, noah kazanır); botlar oyuncuya vurur ve öldürebilir. CZ'de ölünce kendi kale kapında dirilirsin.
- Moradon kapısı → Ardream ışınlanması ücretsiz (`warp_git`). Market (NPC + bot tezgâhları) tamamen bedava.
- Botları kapat: adrese `?bot=0` ya da `localStorage.setItem('ko-bots','0')`.
- **Çevrimiçi**: adrese `?gercek=1` eklenirse gerçek Supabase arka ucu kullanılır (diğer gerçek oyuncular o zaman görünür). Demo modu varsayılandır (offline-first).

## Mobil

Dokunmatik cihazlarda (telefon/tablet) otomatik "mobil mod" açılır (`?mobil=0` kapatır, `?mobil=1` zorlar):
- Sol yarıya dokun-sürükle: joystick · sağ tarafta sürükle: kamera · iki parmak: yakınlaş/döndür · dokun: tıkla/yürü · basılı tut: sağ tık.
- Sağ altta ⚔ (saldır), Z (hedef), 1-4 (kısayol çubuğu); üstte 🎒 çanta, 💬 sohbet, H menü, Esc, tam ekran, arayüzü gizle.
- Arayüz (HUD) ekran boyutuna göre ölçeklenir; küçük ekranda sohbet/mesaj panelleri 💬 ile açılır.
- Ana sayfa duyarlı; PWA bildirimi (manifest) ile ana ekrana eklenip tam ekran açılabilir.
