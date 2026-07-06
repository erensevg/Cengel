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
  Dosyalar: wwwroot/assets/characters/*.glb (+LICENSE).

## GÖRSEL YENİLEME ✅ (mob + arazi)

- **GLTF iskelet moblar**: KayKit Skeletons (CC0) — Minion/Warrior/Rogue/Mage.
  `MOB_MODEL` kod→dosya+ölçek eşlemesi; `_makeGltfMob` AnimationMixer ile
  Idle/Koşu/Saldırı; oyuncu hasar alınca en yakın mob saldırı animasyonu oynatır;
  ışın izi (raycast) grup bazlı özyineli seçim. Prosedürel kutular yalnızca yedek.
  Dosyalar: wwwroot/assets/mobs/*.glb (+LICENSE).
- **Tema uyumu**: moblar iskelet olduğundan mob/item/görev metinleri undead temaya
  çevrildi (İskelet Er/Savaşçı/Şampiyon, Kum Haydudu/Büyücü, Buz Hayaleti/Lordu;
  Kemik Parçası/Kara Kumaş/Çöl Zehri/Şampiyon Nişanı) — `GameConfig.cs`.
- **Arazi + ışık**: harita başına prosedürel detay dokusu (benek/çim/kum/kar,
  `RepeatWrapping`), tema başına güneş rengi/şiddeti + hemisphere + gökyüzü degrade
  (`THEMES.sun/sunI/hemi/speck/sky`). `_buildTerrain` içinde.

  Sonraki mob görsel geliştirmesi için: KayKit Skeletons paketinde başka varyantlar
  (Skeleton_Archer vb.) veya boss için ayrı GLB → `MOB_MODEL`'e ekle.

## İÇERİK GENİŞLETMESİ ✅ (daha fazla canavar/metin/item)

- **21 mob** (önce 10): her haritaya yeni türler + boss'lar + yeni metinler.
  - Doğu Vadisi: Gölge Sıçanı (hızlı sürü), Mezar Muhafızı, **Kemik Lordu (boss)**,
    Gölge Metini.
  - Kızıl Çöl: Kum Sürüngeni, **Kum Firavunu (boss)**, Kum Metini.
  - Buz Zirvesi: Kar Cini, Donmuş Savaşçı, **Ejder Ruhu (final boss, Sv20)**, Ruh Metini.
  - Boss/element tonlaması: `MOB_MODEL[code].tint` → `_makeGltfMob` emissive uygular
    (kırmızı=boss, mavi=buz, altın=firavun). Boss'lar tek spawn + uzun respawn.
  - `metin_buz` istemcide kutu görünüyordu (MOB_STYLE eksik) → düzeltildi; yeni
    metinler (golge/kum/ruh) kendi kristal renkleriyle.
- **55 item** (önce ~28): yeni malzemeler (Gölge Tozu/Firavun Altını/Ruh Parçası),
  büyük iksirler (Can/Mana Macunu), her tür için kademeli silah/zırh/kalkan/takı,
  yeni efsane dropları (Kaos Baltası 1/5M, Zaman Kolyesi 1/500k).
- Yeni metin bekçileri (MetinGuard) + spawn bölgeleri eklendi. Doğu Vadisi'nde
  varlık sayısı ~30 → ~47.

Bilinen kısıt: görev İLERLEMESİ (progress) yeniden girişte sıfırlanır (yalnızca
tamamlanan görevler DB'de); CharacterQuest.Progress alanına periyodik yazım eklenebilir.

## EKONOMİ GÜNCELLEMESİ ✅

- Köy NPC'leri (3 haritada): Tüccar Hong (AL/SAT; malzeme-ekipman satışı %40) ve
  Demirci Kaya (+ basma) — BuyItem/SellItem/UpgradeItem hub metodları, yakınlık şartı
- Ekipman: zırh/kalkan/küpe/kolye/bileklik + savunma (mob hasarı 100/(100+def)) +
  HP bonusu; 6 yuvalı kuşanma; RecalcStats
- Yükseltme +11'e kadar: yang 200*(p+1)^2 + Metin Parçası; şans %100→%10;
  +9 beyaz / +10 altın / +11 KIRMIZI aura (GlowTier snapshot) + envanter parlaması;
  +9 üstü sunucu duyurusu
- Ultra nadir metin dropları: Ejder Kılıcı 1/3M, Ejderin Gözyaşı 1/1M,
  Kadim Bileklik 1/250k — düşünce dünya geneli duyuru
- Test edildi: al/sat, 3 parça kuşanma (saldırı/savunma/HP artışı), +11'e basma,
  kırmızı aura — Playwright ile doğrulandı

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
