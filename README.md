# Çengel — Sinematik 3B Çengel Bulmaca

Türklere özgü **çengel bulmaca** (ok yönlü kare bulmaca) formatında, Three.js ile
yazılmış sinematik bir web oyunu.

![tür](https://img.shields.io/badge/t%C3%BCr-%C3%A7engel%20bulmaca-e8b84b)
![motor](https://img.shields.io/badge/motor-three.js-049EF4)

## Özellikler

- 🧩 **Otantik çengel formatı** — ipuçları hücrelerin içinde; oklar cevabın
  yönünü gösterir: soldan sağa (→), yukarıdan aşağıya (↓) ve kıvrımlı oklar
  (↴ sağındaki kareden aşağıya, ↳ altındaki kareden sağa). Bir ipucu kutusu
  iki ipucu taşıyabilir.
- 🖼️ **Resimli ipuçları** — bazı ipuçları gerçek çengel bulmacalardaki gibi
  görsel (emoji) olarak verilir.
- 🎬 **Sinematik sunum** — açılışta tahtaya spiral kamera dalışı, bloom
  (ışıma), yumuşak gölgeler, yıldızlı gece atmosferi, süzülen toz zerreleri,
  doğru kelimede altın partikül patlamaları, zaferde konfeti yağmuru ve tur
  atan kamera.
- 🇹🇷 **Tam Türkçe destek** — 29 harflik Türk alfabesi, İ/ı dönüşümleri doğru;
  fiziksel klavye ve mobil için ekran klavyesi.
- 🔊 **Sentezlenmiş sesler** — WebAudio ile üretilen tıkırtılar, çan
  arpejleri ve ortam pedi; ses dosyası yok, kapatılabilir.
- 📐 **Üç bulmaca** — Kolay 7×7, Orta 9×9, Zor 11×11. Tümü üreteçle
  oluşturulup kesişimleri doğrulanmıştır.

## Çalıştırma

ES modülleri kullanıldığı için bir HTTP sunucusu gerekir (dosyayı çift
tıklamak yetmez):

```bash
python3 -m http.server 8000
# sonra tarayıcıda: http://localhost:8000
```

İnternet bağlantısı gerekmez; Three.js `vendor/` altında pakete dahildir.

## Nasıl oynanır?

1. Zorluk seç — kamera seni tahtaya götürür.
2. Bir kareye dokun: kelime seçilir; aynı kareye tekrar dokununca yön
   değişir. İpucu kutusuna dokunarak da kelime seçebilirsin.
3. Harfleri yaz. Kelime tamamlanınca otomatik denetlenir: doğruysa altın
   rengine döner ve kilitlenir, yanlışsa kırmızı titrer.
4. Takıldığında 💡 **İpucu** bir harf açar.
5. Tüm kelimeler çözülünce… 🎉

| Tuş | İşlev |
|---|---|
| Harfler | Seçili kelimeye yaz |
| Geri sil | Harf sil |
| Ok tuşları | İmleci taşı |
| Tab / Enter | Sonraki çözülmemiş kelime |

## Proje yapısı

```
index.html        giriş, HUD, ekran klavyesi
css/style.css     sinematik arayüz
js/main.js        sahne, kamera yönetmeni, post-processing, akış
js/board.js       3B tahta, canvas dokulu hücreler, animasyonlar
js/game.js        oyun durumu: seçim, giriş, denetim
js/effects.js     tween motoru, partiküller, WebAudio sesleri
js/puzzles.js     üretilmiş bulmaca verisi (3 bulmaca)
vendor/three/     three.js + gerekli eklentiler (çevrimdışı çalışır)
```
