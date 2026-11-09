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
