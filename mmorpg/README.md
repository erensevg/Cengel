# Metin Efsanesi — Tarayıcı MMORPG (.NET 8 Mikroservis + Three.js)

Metin2 mantığında, tarayıcıda uçtan uca oynanabilen MMORPG:
canavar kes, **metin taşı kır**, XP topla, seviye atla, arkadaş ekle, sohbet et.

## Hızlı başlangıç (geliştirme)

Gereksinim: [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

4 terminalde (sıra önemli değil; hepsi bağımsız ayağa kalkar):

```bash
cd services/Mmorpg.AuthService   && dotnet run   # :5001
cd services/Mmorpg.GameService   && dotnet run   # :5002
cd services/Mmorpg.SocialService && dotnet run   # :5003
cd gateway/Mmorpg.Gateway        && dotnet run   # :5000  ← oyun burada
```

Tarayıcıda **http://localhost:5000** — kayıt ol ve oyna. İki farklı tarayıcı
(veya gizli pencere) açarsan iki karakter aynı dünyada birbirini görür.

Alternatif: `docker compose up --build` (aynı portlar).

Veritabanı: **SQL Server LocalDB** — her servis kendi DB'sini ilk çalıştırmada
`EnsureCreated` ile otomatik oluşturur (`Cengel_Auth` / `Cengel_Game` /
`Cengel_Social`). Bağlantı dizeleri `appsettings.json` içinde
(`(localdb)\MSSQLLocalDB`, Windows Kimlik Doğrulaması). Sıfırlamak için ilgili
DB'yi düşür (ör. SSMS'te `DROP DATABASE Cengel_Game`).

## Mimari

```
                        ┌──────────────────────────┐
  Tarayıcı (Three.js) ──►  Mmorpg.Gateway  :5000   │  YARP reverse proxy
                        │  statik istemci + yönlendirme (WS dahil)
                        └───────┬──────────┬────────┘
            /api/auth/*         │          │        /api/social/*, /hubs/chat
        ┌───────────────────────┘          └──────────────────────────┐
        ▼                        /api/game/*, /hubs/game              ▼
  AuthService :5001                     ▼                    SocialService :5003
  kayıt/giriş, JWT üretimi     GameService :5002             ChatHub: genel+fısıltı,
  PBKDF2 parola; Cengel_Auth   GameHub + dünya döngüsü       çevrimiçi durum; arkadaşlık
                               (150ms tick, sunucu otoriter) API; Cengel_Social
                               mob AI, metinler, XP/level,   (kullanıcı adı çözmek için
                               yang/drop, envanter;          Auth'a HTTP çağrısı yapar)
                               Cengel_Game
```

- **Kimlik**: Auth JWT üretir; Game ve Social aynı simetrik anahtarla doğrular
  (appsettings `Jwt:Key` — üç serviste aynı olmalı, üretimde gizli tutulmalı).
- **Servis başına ayrı veritabanı** (SQL Server LocalDB): servisler birbirinin
  DB'sine dokunmaz.
- **Sunucu otoriter oyun**: istemci yalnızca niyet gönderir (yürü/saldır);
  hasar, XP, level, drop tamamı `WorldService` içinde hesaplanır.
- SignalR WebSocket'leri gateway'den geçer; token `access_token` query'siyle taşınır.

## Oynanış (MVP)

| Sistem | Durum |
|---|---|
| Tıkla-yürü, kamera (sürükle=çevir, tekerlek=yakınlaş) | ✅ |
| Moblar: Yaban Domuzu, Kurt, Çöl Akrebi, Dağ Ayısı — aggro/kovalama/tasma/respawn | ✅ |
| **Metin taşları**: Kaya & Ateş Metini; %66/%33'te bekçi çağırır, bol XP+yang | ✅ |
| XP/level (`xp = 50·seviye^2.2`), level atlayınca tam can + duyuru | ✅ |
| Yang + eşya dropları, envanter, sıralama (top 10) | ✅ |
| Ölüm/diriliş, hasar sayıları (krit dahil) | ✅ |
| Genel sohbet, `/f isim mesaj` fısıltı | ✅ |
| Arkadaş ekle/kabul/liste + anlık çevrimiçi bildirimi | ✅ |

Denge ayarları tek dosyada: `services/Mmorpg.GameService/Domain/GameConfig.cs`
(istemciye `/api/game/config` ile otomatik iner — istemcide kopya tutulmaz).

Kalan işler ve yol haritası: **[ROADMAP.md](ROADMAP.md)**
