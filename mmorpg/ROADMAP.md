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

## YAPILACAK — öncelik sırasıyla 🔜

1. **Karakter sınıfları** (Savaşçı/Ninja/Sura/Şaman): `Character`'a `ClassType`
   ekle; `GameConfig`'e sınıf başına stat/katsayı; istemcide sınıf seçim ekranı
   (giriş sonrası, karakter yoksa). Görsel farklılık için `world.js/_makePlayer`
   renk/silüet varyantları.
2. **Skiller**: `GameHub.CastSkill(skillId)` + cooldown/mana; `WorldService`'te
   alan hasarı (AoE) hesabı; istemcide skill çubuğu (1-4 tuşları) + efektler.
   MP alanı PlayerState/Character'da yok — ekle (MaxMp formülü MaxHp gibi).
3. **Ekipman**: ✅ silahlar eklendi (drop + Equip/Unequip + hasar bonusu +
   ızgara envanter/taşıma/tooltip). Kalan: zırh/kask/kalkan slotları, savunma
   statı, item seviye şartı, yükseltme (+1..+9).
4. **Şifa otu kullanımı**: envanterden tıklayınca `UseItem(code)` → HP tazele
   (sunucuda doğrula, sayıyı düş).
5. **NPC + ticaret**: köyde satıcı NPC (mesh + etkileşim menzili); item satışı
   (yang karşılığı), drop satma.
6. **PvP**: düello isteği → kabul → `Attack`'in oyuncu hedefi desteklemesi
   (WorldService'te `HitMob` benzeri `HitPlayer`).
7. **Harita genişletme/instancing**: `WorldState` tek harita; `MapId` zaten
   Character'da düşünüldü ama kullanılmıyor — bölge başına ayrı `WorldState`
   + SignalR grubu (`world:{mapId}`) ile çoklu harita.
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
