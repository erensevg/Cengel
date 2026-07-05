# YOL HARİTASI — El Devir Dosyası

Bu dosya, projeyi devralacak geliştirici/araç (ör. Cursor) için yazıldı.
Mimari ve çalıştırma için önce [README.md](README.md) oku.

## Nerede ne var? (30 saniyede kod haritası)

| Ne arıyorsun? | Dosya |
|---|---|
| Mob/item/spawn/XP tanımları, denge | `services/Mmorpg.GameService/Domain/GameConfig.cs` |
| Oyun döngüsü: hareket, mob AI, dövüş, ödüller | `services/Mmorpg.GameService/World/WorldService.cs` |
| Canlı dünya durumu + anlık görüntü | `services/Mmorpg.GameService/World/WorldState.cs` |
| Oyuncu komutları (Join/Move/Attack/...) | `services/Mmorpg.GameService/Hubs/GameHub.cs` |
| Sohbet + çevrimiçi takip | `services/Mmorpg.SocialService/Hubs/ChatHub.cs` |
| Arkadaşlık API | `services/Mmorpg.SocialService/Program.cs` |
| Kayıt/giriş/JWT | `services/Mmorpg.AuthService/Program.cs` |
| Yönlendirme kuralları | `gateway/Mmorpg.Gateway/appsettings.json` |
| 3B dünya/varlıklar/efektler (istemci) | `gateway/Mmorpg.Gateway/wwwroot/js/world.js` |
| UI/akış/sohbet/paneller (istemci) | `gateway/Mmorpg.Gateway/wwwroot/js/main.js` |

İstemci build gerektirmez: düz ES modülleri, three.js `wwwroot/vendor/` altında.
Test kancası: tarayıcı konsolunda `window.__mmo()`.

## YAPILDI ✅

- Mikroservis iskeleti (Auth/Game/Social + YARP gateway), servis başına SQLite
- JWT ile kimlik (REST header + SignalR `access_token` query)
- Sunucu otoriter dünya döngüsü (150ms): tıkla-yürü, hız sınırı, sınır kısıtı
- Mob AI: aggro → kovalama → saldırı → tasma → spawn'a dönüş + tam iyileşme; respawn
- Metin taşları: %66/%33 eşiklerinde bekçi çağırma, kırılınca bol XP+yang+parça
- XP/level eğrisi, level atlama (tam can, duyuru, istemcide altın patlama)
- Yang + drop tablosu → envanter (DB), sıralama API
- Ölüm/diriliş; hasar sayıları (krit çarpanı 1.6, %10)
- Genel sohbet, fısıltı (/f), arkadaş ekle/kabul/liste, anlık çevrimiçi bildirimleri
- Three.js istemci: arazi, ağaç/kaya, gölgeli ışık, isim/HP etiketleri,
  kamera (takip+sürükle+zoom), HUD, paneller
- 2 oyunculu Playwright uçtan uca testi geçti (hareket senkronu, dövüş, XP,
  sohbet, arkadaşlık, fısıltı)

## YENİ YAPILDI ✅ (tam yapı güncellemesi)

- MP/mana + yenilenme; can/mana iksirleri (droplar + yeni karaktere başlangıç paketi),
  UseItem; 5/6 tuşları hızlı iksir
- Skill sistemi: seviye şartı + skill puanı (level başına 1), öğren/yükselt (maks 10),
  Güçlü Vuruş / Kasırga Kesiği (AoE) / Savaş Çığlığı (buff); 1-4 tuşları, cooldown,
  skillFx yayını; K penceresi
- Çoklu harita: Doğu Vadisi / Kızıl Çöl (sv5) / Buz Zirvesi (sv10) — harita başına
  spawn + tema (arazi/sis/bitki); SignalR grubu map:{id}
- Işınlanma: spawn yanındaki portal (tıkla → pencere) + Işınlanma Parşömeni (uzaktan);
  seviye şartı; Teleport hub
- Dinamik hikaye: 7 aşamalı "Ejder Tanrısı'nın Gölgesi" görev zinciri (Usta Chen
  anlatısı), görev takipçisi + günlük (J) + hikaye paneli; kill/metin/level/map
  olaylarıyla ilerler; ödüller (yang/XP/item/skill puanı)
- Dinamik dünya olayları: ~3dk'da bir kadim metin ya da canavar dalgası duyurusu
- Sağ tık menüsü kapalı (sağ tık = kamera)
- **GLTF gerçek karakterler**: KayKit Adventurers (CC0) — Şövalye (kendin),
  Barbar/Kurnaz/Büyücü (diğer oyuncular, isim karmasına göre); AnimationMixer ile
  Idle/Koşu/Saldırı animasyonları, crossfade; model yüklenemezse prosedürel yedek.
  Dosyalar: wwwroot/assets/characters/*.glb (+LICENSE). Mobları da GLTF yapmak için:
  KayKit/Quaternius hayvan paketleri → MOB_STYLE yerine aynı desenle yükle.

Bilinen kısıt: görev İLERLEMESİ (progress) yeniden girişte sıfırlanır (yalnızca
tamamlanan görevler DB'de); CharacterQuest.Progress alanına periyodik yazım eklenebilir.

## YAPILACAK — öncelik sırasıyla 🔜

1. **Karakter sınıfları** (Savaşçı/Ninja/Sura/Şaman): `Character`'a `ClassType`
   ekle; `GameConfig`'e sınıf başına stat/katsayı; istemcide sınıf seçim ekranı
   (giriş sonrası, karakter yoksa). Görsel farklılık için `world.js/_makePlayer`
   renk/silüet varyantları.
2. **Skiller**: ✅ (üstte). Kalan: sınıf bazlı skill setleri, skill kitabı dropları.
3. **Ekipman**: ✅ silahlar eklendi (drop + Equip/Unequip + hasar bonusu +
   ızgara envanter/taşıma/tooltip). Kalan: zırh/kask/kalkan slotları, savunma
   statı, item seviye şartı, yükseltme (+1..+9).
4. **Şifa otu kullanımı**: envanterden tıklayınca `UseItem(code)` → HP tazele
   (sunucuda doğrula, sayıyı düş).
5. **NPC + ticaret**: köyde satıcı NPC (mesh + etkileşim menzili); item satışı
   (yang karşılığı), drop satma.
6. **PvP**: düello isteği → kabul → `Attack`'in oyuncu hedefi desteklemesi
   (WorldService'te `HitMob` benzeri `HitPlayer`).
7. **Harita genişletme**: ✅ 3 harita + ışınlanma var. Kalan: zindan/instance
   (grup başına kopya MapState), boss odaları.
8. **Ölçekleme**: GameService şu an tek süreç (state bellekte). Yatayda
   ölçeklemek için: yapışkan oturum + harita başına süreç, ya da state'i
   Redis'e taşı; SignalR için Redis backplane (`AddStackExchangeRedis`).
9. **Güvenlik sertleştirme**: `Jwt:Key`'i ortam değişkenine taşı, HTTPS,
   hız sınırlama (özellikle /api/auth), sohbet için küfür filtresi/flood koruması.
10. **Kalıcı sohbet + çevrimdışı fısıltı** (SocialService'e mesaj tablosu).

## Bilinçli MVP kısıtları / tuzaklar ⚠️

- `Presence` (Social) ve `WorldState` (Game) **bellek içi** — servis yeniden
  başlarsa oturumlar düşer (istemci otomatik yeniden bağlanır, karakter DB'de).
- Aynı hesapla ikinci `JoinWorld` reddedilir ("zaten oyunda") — bağlantı
  kopması sonrası eski bağlantı OnDisconnected ile temizlenene dek ~30sn
  bekleme gerekebilir.
- Arazi yüksekliği (`groundH`) yalnızca görsel; sunucu düz düzlemde mesafe
  hesaplar. Tepeler dikleşirse sunucuya da aynı fonksiyonu taşı.
- İstemcide anti-cheat yok denecek kadar az: hareket hedefi sunucuda
  sınırlandırılıyor ama hızlı `MoveTo` spam'i sorun değil (hedef üzerine yazılır).
- EF migrations yok: şema `EnsureCreated` ile kurulur. Şema değişikliğinde ya
  .db dosyalarını sil ya da migrations'a geç (`dotnet ef migrations add ...`).
  (Silah/slot güncellemesi şemayı değiştirdi: eski `game.db` varsa SİL.)
- Üç serviste aynı `Jwt:Key` (appsettings) — değiştirirsen üçünü birden değiştir.

## Test

```bash
dotnet build                          # kök mmorpg/ klasöründe
# 4 servisi başlat, sonra:
node scratch/mmo-test.js              # (repo dışında tutuluyordu; akış: kayıt →
                                      # 2 oyuncu → hareket → mob kesme → sohbet →
                                      # arkadaşlık → fısıltı)
```
Hızlı el testi: iki gizli pencerede http://localhost:5000, iki hesap, birbirinizi kesin. 🙂
