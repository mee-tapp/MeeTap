# Meetap – Görev Planı ve Günlük

Notion'a içe aktarılabilir (Import → Markdown). Bu dosya kaynak; Notion bağlayıcısı yetkilendirilince aynı liste oradan güncellenecek.
Durum: ⬜ yapılmadı · 🟨 devam ediyor · ✅ bitti · ⏸ karar bekliyor

Kurallar: onaylı arayüz tasarımı değişmez; sahte mekan/yorum yok; yatırım öncesi cepten para çıkmaz; yeni kavram = taksonomiye alan + kataloğa veri, motora özel kural değil; içerik kaldırma kararları Ali'ye sorulur.

---

## ŞU AN (14 Eylül 2026, gece)

- Yön değişti: 87k açık veri silindi; Bakü'de **261 mekanlık pilot katalog** (129 restoran, 60 kafe, 27 bar, 25 tatlıcı, 10 lounge, 7 quick bites, 3 çay evi), her mekanda Google puanı + yorum sayısı, 2.162 yorum metni (mekan başına ~8), olanaklar (kabinet 50 mekanda), fiyat aralığı (185 mekanda).
- Kaynaklar: Apify Google Maps Scraper (771 aday, 3,95 $ ücretsiz kredi) + yerel açık kaynak `gosom/google-maps-scraper` (detay ve yorumlar, sıfır maliyet). Google derin yorum çekimini engelliyor (403); aşılmıyor.
- Motor kapalı şemada: özellikler (kabinet, karaoke, canlı müzik…), öğün, yemek adı (yorum metinlerinde arama), Google puanı kalite, "randevu/aile için iyi" verisi amaç kanıtı, mesafe bilgi amaçlı. Test seti 25/25 (kurallar ve DeepSeek).
- Canlı site aynı veritabanını kullanıyor; Vercel'de DeepSeek çalışıyor (doğrulandı).
- Ekip: öneri sistemi Ali + Claude; hesap/işletme paneli Nihat.

## SIRADAKİ ADIMLAR (öncelik sırasıyla)

1. ⬜ **Altın set** — Ali 40 cümle + doğru mekanlar yazar; Claude `scripts/eval/ranking-eval.mjs` ile hit@3 ölçer, ağırlık ayarlar (hedef ≥ %80)
2. ⬜ **LLM profil** — yorum + olanaklardan imza yemekler, güçlü/zayıf yönler, özet (`profile-llm.mjs` genişletme, ~0,5 $)
3. ⬜ **Elle kalite turu** — Ali 261 mekanın tür/mutfak/kabinet bilgisini gözden geçirir (2 saat)
4. ⬜ **Yorum derinliği** — 1 Ekim Apify kredisi: `apify-reviews.mjs --max-reviews 25`; Tripadvisor anahtarı gelince `tripadvisor.mjs` + `merge-external.mjs`
5. ⬜ **Katalog büyütme** — Bakü 500 (çay evi, quick bites eksik), sonra İstanbul 300
6. ⬜ **Arayüz küçük işler** — mesafe kartında araba süresi, detayda Google puanı, Azerice açıklama dili
7. ⬜ **Ürün** — grup sohbeti (Nihat'ın hesap altyapısı üstüne), harita ve rota

---

## Etap 0 – Kararlar ve altyapı ✅

- [x] ✅ Pilot şehir: Bakü (İstanbul sonra, aynı tarifle)
- [x] ✅ Supabase projesi (ap-northeast-2), PostGIS, migration mekanizması (`_migrations`, 0001–0022)
- [x] ✅ LLM: DeepSeek, yerel `.env` ve Vercel'de tanımlı
- [x] ✅ `.env` git dışı; anahtarlar sohbete yapıştırılmaz

## Etap 1 – Pilot katalog (14 Eylül) ✅ ilk sürüm

- [x] ✅ Kapalı şema: `src/lib/catalog/taxonomy.ts` (tür, mutfak, öğün, amaç, özellik; Google EN/AZ ve Tripadvisor etiket eşlemeleri), migration 0021–0022
- [x] ✅ Aday listesi: `scripts/catalog/apify-places.mjs --search` (771 mekan, merkez + Bilgəh/Mərdəkan/Novxanı/Nardaran)
- [x] ✅ Seçim: `select-pilot.mjs` (tür kotaları, otel/salon/mağaza eleme) → 181 mekan; kafe turu +91
- [x] ✅ Detay ve yorumlar: yerel `gosom/google-maps-scraper` (`-c 1 -depth 1 -disable-page-reuse`), yükleme `import-gosom.mjs`
- [x] ✅ Eski açık veri silindi (`scripts/db/reset-venues.mjs`); motor yalnızca `catalog_tier='pilot'`
- [ ] ⬜ LLM profil ve imza yemekler (`signature_dishes`, `profile`)
- [ ] ⬜ Elle kalite turu (`catalog_notes`)
- [ ] ⬜ Yorum derinliği (Apify 1 Ekim; Tripadvisor anahtar gelince)
- [ ] ⬜ Aylık tazeleme (Google içeriği 30 gün kuralı; profil bizim türev içeriğimiz)
- [ ] ⬜ Bakü 500, İstanbul 300

## Etap 2 – Öneri motoru ✅ v2

- [x] ✅ Niyet şeması: amaç, mutfak, ortam, bütçe, kişi sayısı, ihtiyaçlar, **özellikler, öğün, yemek adı**, eşlenemeyenler
- [x] ✅ DeepSeek çözümleyici + kural tabanlı TR/AZ/EN yedek; "Basic understanding mode" notu; `parser_error` telemetrisi
- [x] ✅ Aday havuzu: PostGIS `venues_nearby` (mutfak, etiket, özellik, ad anahtarı, katalog katmanı)
- [x] ✅ Puanlama: mutfak ve özellik zorunluluk, yemek adı yorum kanıtı, Google puanı kalite (Bayes), amaç için `good_for` verisi + mekan tipi kuralı (bar/fast food/salon), mesafe 0.4
- [x] ✅ Kapsama raporu: kontrol edilemeyen istekler puanlanmaz, arayüzde söylenir
- [x] ✅ Konum: izin bekleme, kaba konum eleme, doğruluk kaydı
- [x] ✅ Test seti 25 cümle (`scripts/eval/intent-eval.mjs`)
- [ ] ⬜ Sıralama altın seti (40 cümle) ve `ranking-eval.mjs`
- [ ] ⬜ Niyet önbelleği (aynı cümle → LLM'e gitme)
- [ ] ⬜ Artı/eksi karşılaştırması (ilk 3 sonuç)

## Etap 3 – Hesap, işletme, ürün (Nihat) 🟨

- [x] ✅ Giriş/hesap sayfası, hesap tipi (kişisel/işletme), işletme paneli, mekan fotoğrafı ve menü alanları (migration 0017–0020)
- [ ] ⬜ Kaydedilenler, ziyaret geçmişi, kullanıcı puanları arayüzde
- [ ] ⬜ "Mekanını sahiplen": işletme kendi özelliklerini girer (kabinet, canlı müzik günü…), onaylanınca katalog güncellenir
- [ ] ⬜ Grup sohbeti: öneriler paylaşılır, mesafeye grup karar verir
- [ ] ⬜ Harita ve rota (MapLibre + OpenFreeMap, OpenRouteService)
- [ ] ⬜ Bakü şehir kartı fotoğrafı; Londra/NY/Barselona/Paris "Coming soon" (Ali kararı)

## Yatırım sonrası (ücretli)

- Google Places API ile tazeleme (scraper bırakılır), Wolt/Yandex Eats menü verisi, daha güçlü LLM, toplu taşıma rotası, kişiselleştirme.

---

## Çalışma günlüğü

- **2026-09-11** — Açık veri boru hattı: OSM + Overture, İstanbul 80.431 + Bakü 7.234 mekan; DeepSeek niyet çözümleyici; uçtan uca öneri; arayüz gerçek veriye bağlandı.
- **2026-09-12** — Kıyı verisi (`seaside`), 3 sonuçlu kart, açık mutfak sözlüğü, dürüst açıklamalar, konum izni, fiyat seviyesi; Nihat'ın venue intelligence katmanı ve Tripadvisor pilotu; scaffold temizliği. Ali'nin Azerice test cümlesi üzerine: kapsama raporu, mesafe ağırlığı düşürüldü, amaç–mekan tipi kuralı, şehrin kendi mutfağı kanıtı, kaba konum eleme. Canlıda DeepSeek'in çalışmadığı bulundu (Vercel anahtarı).
- **2026-09-15** — Ali: "xəngəl restoranı" yanlış sonuç veriyor ve uzun sürüyor. Neden: DeepSeek chat API saatlerce yanıt vermedi (bakiye 6,91 $, sorun onlarda); her arama 8 sn zaman aşımı + kural ayrıştırıcısı, o da "xəngəl"i bilmiyordu. Genel çözüm: LLM sağlayıcı zinciri (DeepSeek → Groq → Gemini, anahtar varsa) + 90 sn soğuma, niyet önbelleği (`intent_cache`), kural ayrıştırıcısına 36 yemeklik sözlük (xəngəl = khinkali = hinkali), Azerice ə normalizasyonu, yemek adı yorumlarda tüm yazımlarıyla aranıyor. DeepSeek kapalıyken bile "xəngəl restoranı" → Xəngəlation, Marani, Gaumarjos (3 sn).
- **2026-09-14** — Yön değişikliği: pilot katalog. Apify ile 771 aday; eski veri silindi; Vercel'de DeepSeek doğrulandı (Nihat). Yerel scraper kuruldu (Go), 181 mekan + 91 kafe çekildi ve yüklendi (261 mekan, 2.162 yorum). Taksonomi (EN/AZ etiketler), migration 0021–0022, motor kapalı şemaya geçti (özellik, öğün, yemek adı, Google puanı, good_for). Sonuç: "kabinetli Azerbaycan restoranı, yıl dönümü" → Anadolu, Nərgiz, Firuzə, Sumakh; "xəngəl" → Xəngəlation; "cheesecake" → bonbon patisserie.

## Karar bekleyenler (Ali)

| Konu                                                        | Seçenekler                                                            | Durum                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| Groq yedek LLM anahtarı (`GROQ_API_KEY`, ücretsiz, kartsız) | Ali açar, `.env` + Vercel                                             | ⏸ önerildi (15 Eylül) |
| Altın set (40 cümle + doğru mekanlar)                       | Ali yazar                                                             | ⏸ bekleniyor          |
| Yorum derinliği                                             | 1 Ekim Apify kredisi / Apify ücretli plan / yatırım sonrası resmi API | ⏸ 1 Ekim varsayımı    |
| Tripadvisor anahtarı (kart gerekir)                         | aç / erteleme                                                         | ⏸ ertelendi           |
| Veri yokken şehir kartları (Londra, NY, Barselona, Paris)   | kalsın / kaldır / "yakında"                                           | ⏸ sonra sorulacak     |
