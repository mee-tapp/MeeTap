# Meetap – Pilot Katalog Planı (Bakü, 250–300 mekan)

> 14 Eylül 2026. Ali'nin yön değişikliği kararı. **Onaylandı ve uygulama başladı.** Ali'nin kararları: eski 87k veri silinir; yorum derinliği için üçüncü taraf toplama servisi kullanılır (5 yorum yetmez); kategoriler tamamlanır; Bakü dışı gidilir mekanlar dahil; kaynak seçimi Claude'un (karar: Google + Tripadvisor + Apify, aşağıda); öneri sistemi Ali + Claude'un işi, Nihat hesap/işletme tarafında.

**Uygulama durumu:** şema (migration 0021), taksonomi (`src/lib/catalog/taxonomy.ts`), toplama betikleri (`scripts/catalog/*`) ve sıfırlama betiği (`scripts/db/reset-venues.mjs`) yazıldı. Anahtarlar `.env`'e girince Adım A'dan itibaren koşulur.

## 0. Neden yön değiştiriyoruz

MVP'nin tek sorusu: **"LLM'li öneri sistemimiz iyi mi?"** Bunu ölçmek için mekanların iyi bilinmesi gerekir. Bugünkü 87.665 açık veri kaydı (OSM + Overture) bunu vermiyor:

- Mekanın **kalitesi** yok (puan, yorum yok). Motor "doğru türde mekan"ı bulabiliyor ama "iyi mekan"ı ayırt edemiyor.
- Etiketler seyrek ve tutarsız: Bakü'de 3.263 restoranın 88'i "azerbaijani", 1.935'inin mutfağı hiç yok.
- Her test cümlesi yeni bir boşluk çıkarıyor (kabinet, xəngəl, şirniyyat…) ve her seferinde motora özel kural ekliyoruz. Kategori bitmez; **kapalı bir katalog şemasına** geçmeden bu döngü kapanmaz.

Yeni ilke: **Az ama tam bilinen mekan.** Bakü'de 250–300 mekan, her biri aynı şemayla doldurulmuş, her birinin gerçek yorumu ve puanı var. Öneri sistemi bu katalog üstünde ölçülür; iyi çalışırsa aynı tarifle büyütülür (Bakü 1.000, sonra İstanbul).

Mevcut 87k kayıt **silinir** (Ali'nin kararı: karışıklık yaratıyor). Kaynak dosyalar (`data/venues-*.json`) yerelde duruyor, gerekirse `scripts/db/load-venues.mjs` ile geri yüklenebilir. Silme komutu yıkıcı olduğu için Ali çalıştırır:

```bash
node --env-file=.env scripts/db/reset-venues.mjs
```

Öneri motoru artık yalnızca `catalog_tier = 'pilot'` mekanlarla cevap verir (`CATALOG_TIER` ortam değişkeni; varsayılan `pilot`). Katalog yüklenene kadar site boş sonuç gösterir; bu bilinçli.

## 1. Katalog şeması (kapalı, sonlu)

Tripadvisor filtrelerinden yola çıkan, bizim amaçlarımıza göre daraltılmış şema. Niyet çözümleyici (DeepSeek) serbest metni **yalnızca bu alanlara** eşler; eşleyemediğini `unmapped` olarak bildirir (bu mekanizma bugün var). Yeni bir kavram çıkınca motora kural eklenmez, şemaya alan eklenir ve katalog o alanla doldurulur.

| Alan                                                             | Değerler (pilot)                                                                                                                                                                                                                          | Kaynak                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tür** (`establishment_type`)                                   | restaurant, cafe_coffee, bar_pub, dessert_bakery, quick_bites, lounge_hookah, tea_house                                                                                                                                                   | Google `types` + Tripadvisor kategori + elle kontrol                                                                                                                                                                                     |
| **Mutfak** (`cuisines[]`, kapalı liste ~25)                      | azerbaijani, turkish, georgian, uzbek, russian, european, italian, pizza, japanese_sushi, chinese, indian, middle_eastern, mediterranean, steakhouse, seafood, american_burger, cafe_food, breakfast, dessert, vegetarian, international… | Tripadvisor `cuisine` + Google `primaryType`/`types` + elle                                                                                                                                                                              |
| **Öğün / zaman** (`meals[]`)                                     | breakfast, brunch, lunch, dinner, late_night                                                                                                                                                                                              | Tripadvisor `meal_types`, Google `servesBreakfast/Lunch/Dinner/Brunch`, çalışma saatleri                                                                                                                                                 |
| **Amaç uygunluğu** (`good_for[]`)                                | date_romantic, celebration, family_kids, friends_groups, business, solo_work, tourists                                                                                                                                                    | Yorumlardan LLM profili (Nihat'ın `venue_intelligence`) + Google `goodForChildren/goodForGroups`                                                                                                                                         |
| **Özellikler** (`features[]`)                                    | private_room (kabinet/loca), karaoke, live_music, hookah, outdoor_terrace, sea_view, city_view, kids_area, parking, wifi, reservations, serves_alcohol, no_alcohol, halal, vegetarian_options, wheelchair, pet_friendly, late_open        | Tripadvisor `features` ("Private Dining", "Reservations", "Outdoor Seating", "Serves Alcohol"…), Google boolean alanları (`outdoorSeating`, `liveMusic`, `reservable`, `servesWine`, `accessibilityOptions`…), yorum metni, elle kontrol |
| **Fiyat** (`price_level` 1–4)                                    | ₼ … ₼₼₼₼                                                                                                                                                                                                                                  | Google `priceLevel`, Tripadvisor `price_level` (ikisi de yoksa elle)                                                                                                                                                                     |
| **Kalite**                                                       | `rating`, `review_count` (kaynak bazında), Bayes düzeltmeli birleşik puan                                                                                                                                                                 | Google + Tripadvisor                                                                                                                                                                                                                     |
| **İmza yemekler** (`signature_dishes[]`, açık liste ama veriden) | "xəngəl", "cheesecake", "sac ichi", "dolma"…                                                                                                                                                                                              | Yorum metinleri + Tripadvisor "dishes" + LLM profili + elle                                                                                                                                                                              |
| **Profil** (`profile`)                                           | 2–3 cümle özet, güçlü/zayıf yönler, dikkat notları                                                                                                                                                                                        | LLM, yalnızca gerçek yorumlardan                                                                                                                                                                                                         |
| **Konum**                                                        | koordinat, semt, adres, çalışma saatleri                                                                                                                                                                                                  | Google (koordinat/saat) + OSM/Overture eşleşmesi                                                                                                                                                                                         |

"Xəngəl yemek istiyorum" → çözümleyici `dish = "xəngəl"` çıkarır, motor `signature_dishes` ve yorum metinlerinde arar; mutfak tahmini yapmaz. "Kabinet olsun" → `features` içinde `private_room`; katalogda yoksa "bu bilgi bizde yok" der (bugünkü kapsama raporu). "Cheesecake nerede en iyi" → `dish = cheesecake` + kalite sıralaması; pilotun sonunda bu cümle çalışmalı.

## 2. Mekan seçimi: hangi 250–300?

Hedef dağılım (Bakü merkez: İçərişəhər, Sahil, Nizami, Fəvvarələr, Nəsimi, Yasamal, Xətai, Bulvar; artı Bilgəh/Mərdəkan'da 10–15 "gidilir" mekan):

| Tür                | Adet | Seçim ölçütü                                                   |
| ------------------ | ---- | -------------------------------------------------------------- |
| Restoran           | 150  | Google yorum sayısı ≥ 200 ve puan ≥ 4.2; her mutfaktan en az 5 |
| Kafe / kahve       | 50   | yorum ≥ 100, puan ≥ 4.3                                        |
| Bar / pub / lounge | 40   | yorum ≥ 100                                                    |
| Tatlı / fırın      | 25   | yorum ≥ 100 (cheesecake, baklava, şəkərbura…)                  |
| Çay evi / nargile  | 15   | yorum ≥ 100                                                    |
| Quick bites        | 20   | yorum ≥ 150 (dönər, qutab, pide)                               |

Seçim listesi bir tabloya (Google Sheet ya da `data/catalog/baku-pilot.csv`) çıkar; Ali ve Nihat 1 saatte "bu var, bu yok, şunu ekle" diye elden geçirir. **Elle seçim meşru ve ücretsiz**; 300 mekan için en güvenilir yöntem.

## 3. Veri kaynakları ve adım adım toplama (0 ₼)

**Kaynak kararı (güncel, 14 Eylül akşam): önce yalnızca Apify.** Ali'nin isteği "scraper kullanalım, anahtar peşinde koşmayalım". Google Cloud hesabı (kart) gerekmiyor; Apify'ın Google Maps Scraper'ı hem aday listesini hem mekan detayını (saatler, olanaklar, açıklama) hem yorumları veriyor. Tek anahtar: `APIFY_TOKEN` (ücretsiz plan, kartsız, ayda 5 $ kredi; kredi bitince çalışma durur, para çıkmaz). Google Places API betikleri (`google-candidates.mjs`, `google-details.mjs`) alternatif olarak repoda kalır; Tripadvisor sonraya.

| Adım                                                                     | Betik                                         | Apify maliyeti (tahmini)             |
| ------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------ |
| A. Aday listesi: 36 arama × 20 sonuç merkez + 4 dış bölge × 3 arama × 10 | `apify-places.mjs --search`                   | ≈ 840 mekan × 0,004 $ ≈ 3,4 $        |
| B. Seçim (`keep` sütunu)                                                 | `select-pilot.mjs` + elle                     | 0                                    |
| C+D. 300 mekan detay + 10'ar yorum                                       | `apify-places.mjs --details --max-reviews 10` | 300 × 0,006 + 3.000 × 0,0005 ≈ 3,3 $ |
| Yorum derinliği (25'e tamamlama, sonraki ay)                             | `apify-reviews.mjs --max-reviews 25`          | ≈ 4.500 × 0,0006 ≈ 2,7 $             |

Toplam ≈ 9,4 $. Ücretsiz kredi aylık 5 $: bu ay A + seçim + 150 mekanın detayı; kalan detaylar ve yorum derinliği 1 Ekim'den sonra, ya da Apify'a 5 $ yüklenip bir günde bitirilir (Ali'nin kararı). Fiyatlar Apify'ın olay başına listesinden; gerçek tutar çalıştırınca panelde görülür.

**Eski üçlü karar (Google API + Apify + Tripadvisor), referans için:**

| Kaynak                                                            | Ne verir                                                                                                                                    | Ücretsiz sınır                                                       | Betik                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Google Places API (New)                                           | aday listesi, koordinat, saat, fiyat seviyesi, puan + yorum sayısı, teras/canlı müzik/rezervasyon/çocuk/alkol gibi boolean alanlar, 5 yorum | SKU başına aylık 10.000 / 5.000 / 1.000 çağrı; 300 mekan çok altında | `scripts/catalog/google-candidates.mjs`, `google-details.mjs`                    |
| Apify "Google Maps Reviews Scraper" (hosted servis, Ali üye olur) | mekan başına 25–40 yorum: kalite, imza yemekler, kabinet/karaoke gibi özellikler buradan çıkar                                              | aylık 5 $ kredi ≈ 8.000 yorum (yorum başına ≈ 0,0006 $)              | `scripts/catalog/apify-reviews.mjs`                                              |
| Tripadvisor Content API                                           | ikinci puan, sıralama, `cuisine`, `features` ("Private Dining" → kabinet), `meal_types`, `trip_types`, 5 yorum                              | aylık 5.000 çağrı                                                    | `scripts/enrich/tripadvisor.mjs` (mevcut) + `scripts/catalog/merge-external.mjs` |

Neden Apify: kendi scraper'ımızı yazıp Google'ın bot korumasını aşmakla uğraşmıyoruz; hosted bir servisin API'sini çağırıyoruz, hacim küçük (300 mekan), ücretsiz kotada. Google'ın hizmet şartları açısından risk sıfır değil; Ali bunu bilerek "scraper kullanacağız" dedi. Ham yorumlar `venue_reviews_external`'da durur, arayüzde gösterilmez; kullanıcıya LLM profili ve kaynaklı puanlar gider. Wolt/sosyal medya yatırım sonrası.

### Adım A – Aday listesi (`apify-places.mjs --search`; alternatif `google-candidates.mjs`)

```bash
node --env-file=.env scripts/catalog/apify-places.mjs --search --city Baku --dry-run   # sorguları ve maliyeti gösterir
node --env-file=.env scripts/catalog/apify-places.mjs --search --city Baku
```

Google Places API yolu (anahtar varsa):

- Google Cloud'da proje + faturalama hesabı (kart ister; kotalar ücretsiz). `.env` → `GOOGLE_PLACES_API_KEY`.
- 10 Bakü bölgesi (merkez semtler + Bilgəh, Mərdəkan, Novxanı) × 38 sorgu ("Azerbaijani cuisine restaurant", "restaurant with private rooms", "cheesecake", "hookah lounge"…) Text Search; her mekan tek satır: ad, koordinat, puan, yorum sayısı, fiyat, Google tipleri. ~380 çağrı (Pro kotası 5.000).
- Çıktı: `data/catalog/baku-candidates.json` ve `.csv`.

```bash
node --env-file=.env scripts/catalog/google-candidates.mjs --city Baku
```

### Adım B – Seçim (`select-pilot.mjs` + elle)

- Bölüm 2'deki dağılım ve eşiklerle 300 mekan önerilir (`keep = 1`), Bakü dışı 15 kota ayrı. Ali ve Nihat CSV'de `keep` sütununu düzeltir.

```bash
node scripts/catalog/select-pilot.mjs --city Baku
```

### Adım C – Mekan detayı (`apify-places.mjs --details`; alternatif `google-details.mjs`)

```bash
node --env-file=.env scripts/catalog/apify-places.mjs --details --city Baku --max-reviews 10 --limit 3 --dry-run
node --env-file=.env scripts/catalog/apify-places.mjs --details --city Baku --max-reviews 10
```

Scraper'ın "additionalInfo" olanakları (Outdoor seating, Live music, Private dining room, Halal food, Good for kids, Romantic…) `GOOGLE_AMENITY_MAP` ile özelliklere, amaçlara ve ortam etiketlerine; kategori adları (`Azerbaijani restaurant`, `Hookah bar`, `Pastry shop`…) `GOOGLE_CATEGORY_NAME_MAP` ile tür ve mutfağa çevrilir.

Google Places API yolu (anahtar varsa):

- `keep = 1` satırlar için tek Place Details çağrısı, alan maskesiyle: çalışma saatleri, `priceLevel`, `reviews` (en fazla 5), `outdoorSeating`, `liveMusic`, `reservable`, `goodForChildren`, `goodForGroups`, `servesBreakfast/Brunch/Lunch/Dinner/Dessert/Coffee/Wine/Beer/Cocktails/VegetarianFood`, `parkingOptions`, `accessibilityOptions`, `editorialSummary`. 300 çağrı = aylık 1.000 Enterprise kotasının içinde.
- **Saklama kuralı:** Google Maps Platform şartları Places içeriğinin (place_id hariç) en fazla 30 gün önbelleklenmesine izin verir. Bu yüzden Google'dan gelen ham alanlar aylık yenilenir (300 çağrı, ücretsiz); yorumların kendisi ham olarak saklanmaz, LLM ile üretilen **profil** (bizim türev içeriğimiz) saklanır. Bu ayrımı hukuken bir kez teyit ettirmek gerekir.

```bash
node --env-file=.env scripts/catalog/google-details.mjs --city Baku --currency AZN
```

### Adım D – Yorum derinliği (`apify-reviews.mjs`)

- Apify'da ücretsiz hesap, `.env` → `APIFY_TOKEN`. Mekan başına 25 yorum (en yeni), 20'şerlik partiler, `venue_reviews_external(source='google')`.

```bash
node --env-file=.env scripts/catalog/apify-reviews.mjs --city Baku --max-reviews 25
```

### Adım E – Tripadvisor Content API (`tripadvisor.mjs` + `merge-external.mjs`)

- Ücretsiz 5.000 çağrı/ay, kart gerekli, mekan başına 5 yorum + puan + sıralama + `cuisine` + `features` ("Private Dining", "Reservations", "Seating", "Serves Alcohol", "Wheelchair Accessible"…) + `meal_types` + `dietary_restrictions`. Atıf zorunlu (logo/bubble görseli, mekan sayfasında gösterilecek).
- Eşleştirme: ad + koordinat (mevcut `scripts/enrich/tripadvisor.mjs`). 300 mekan × (search + details + reviews) ≈ 900 çağrı.
- Böylece mekan başına en az 10 gerçek yorum (5 Google + 5 Tripadvisor), iki ayrı puan ve özellik listesi olur. Hangi kaynağın "daha iyi" olduğunu seçmeye gerek yok: ikisi de alınır, profil ikisinden üretilir, arayüzde iki puan da kaynağıyla gösterilir.

```bash
node --env-file=.env scripts/enrich/tripadvisor.mjs --city Baku --limit 300
node --env-file=.env scripts/catalog/merge-external.mjs --city Baku
```

### Adım F – LLM profili (DeepSeek, ~0,5 $ toplam)

- Girdi: 30–40 yorum + Google/Tripadvisor özellik alanları + tür/mutfak. Çıktı (JSON, zod ile doğrulanır): `good_for`, `features` (yorumda geçen kabinet/karaoke/manzara…), `signature_dishes`, `aspects` (yemek, servis, atmosfer, fiyat/performans, temizlik puanları), `cautions`, 2–3 cümle özet. Mevcut `venue_intelligence` tablosu ve `scripts/enrich/profile-llm.mjs` bunun için yeniden kullanılır; şema bölüm 1'e göre genişletilir.
- İlke korunur: LLM sadece **gerçek yorumlardan** çıkarım yapar, yorum yoksa alan boş kalır.

### Adım G – Elle kalite turu (Ali, 2–3 saat)

- 300 satırlık tablo: tür, mutfak, fiyat, `features` (özellikle `private_room`, `karaoke`, `sea_view`), `good_for`. Yanlışlar düzeltilir, eksikler doldurulur. Kabinet gibi yerel bilgi Google'da alan olarak yok; Tripadvisor "Private Dining" + yorum metni + elle bilgi birleşince pilot için yeterli.
- Düzeltmeler doğrudan veritabanına (`catalog_notes` dolu satırların mutfak/tür bilgisi sonraki yenilemelerde ezilmez). **Bizim ilk ham verimiz** budur.

### Adım H – Büyüme (pilot sonrası, hâlâ ücretsiz)

- Uygulama içi yorumlar (bugün var) ve "mekanını sahiplen" formu: işletme kendi özelliklerini (kabinet var, canlı müzik cuma, çocuk alanı) girer; onaylanınca `features` güncellenir. Ünlü olunca bu kanal ana veri kaynağı olur.
- Aynı tarifle Bakü 1.000 mekan, sonra İstanbul 300.
- Yatırım sonrası: Google Places ücretli hacim, Wolt/Yandex Eats menü verisi anlaşmayla, TikTok/Instagram yalnızca resmi API veya ajans verisiyle (bunların açık scrape yolu yok; TikTok Research API başvuru ister).

## 4. Motorda değişecekler (plan onaylanınca)

1. `venues.catalog_tier` ('pilot' | 'open_data'); öneri motoru pilot mekanlar üstünde çalışır, boş kalırsa açık veriye düşer ve bunu söyler.
2. Niyet şeması bölüm 1'deki kapalı listelere geçer; `dish` alanı eklenir (serbest metin, veriden eşleşir). Bugünkü "açık mutfak sözlüğü" pilotta kapalı listeye iner; listede olmayan mutfak `unmapped`'e düşer.
3. Puanlama: mutfak (zorunlu) → tür/amaç uyumu (bar ≠ randevu kuralı zaten var) → özellik eşleşmesi (kabinet istendiyse `private_room` zorunlu, yoksa "bilgi yok") → kalite (gerçek puan, Bayes) → bütçe → ortam/profil → mesafe (bilgi). Yorum tabanlı profil ağırlığı artar çünkü artık her mekanda var.
4. Açıklamalar yorumlara dayanır: "yorumlara göre servis hızlı, kabinet var, tatlıları övülüyor".
5. Arayüz: mekan detayında iki kaynaklı puan ve Tripadvisor atıf görseli; kartlarda "Google 4.6 (1.2k) · Tripadvisor 4.5 (700)".

## 5. Ölçüm: sistem iyi mi?

- **Altın set:** Ali 40 gerçek cümle yazar (Azerice/Türkçe/İngilizce karışık, "cheesecake nerede", "kabinetli milli mutfak", "arkadaşlarla bira", "iş yemeği"…) ve her biri için "doğru cevap" saydığı 3–5 mekanı katalogdan işaretler.
- **Metrik:** ilk 3 sonuçta en az bir doğru mekan (hit@3) ve ilk sıranın doğruluğu (precision@1). Hedef: hit@3 ≥ %80.
- Betik: `scripts/eval/ranking-eval.mjs`; her ağırlık değişikliği bu sete karşı koşulur, `query_logs` tıklamaları ikinci sinyal.

## 6. Sıra ve süre (tahmini, iki kişi)

| #   | İş                                                                                                   | Kim                     | Süre     |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| 0   | Eski veriyi sil: `node --env-file=.env scripts/db/reset-venues.mjs`                                  | Ali                     | 1 dk     |
| 1   | `.env` → `APIFY_TOKEN` (apify.com ücretsiz hesap, kartsız); Google/Tripadvisor anahtarı şimdilik yok | Ali                     | 10 dk    |
| 2   | ✅ Şema (0021), taksonomi, betikler                                                                  | Claude                  | yapıldı  |
| 3   | Adım A + B: `apify-places.mjs --search` ve `select-pilot.mjs`                                        | Claude koşar            | 30 dk    |
| 4   | Elle seçim: `keep` sütunu                                                                            | Ali                     | 1 saat   |
| 5   | Adım C + D: `apify-places.mjs --details` (detay + yorumlar); Tripadvisor sonra                       | Claude koşar            | 1 saat   |
| 6   | Adım F: profil üretimi (şema genişletme + toplu betik)                                               | Claude                  | 1 gün    |
| 7   | Adım G: elle kalite turu                                                                             | Ali                     | 3 saat   |
| 8   | Motor: kapalı şema, `dish`, özellik eşleşmesi, yorum tabanlı puan                                    | Claude + Ali            | 2 gün    |
| 9   | Altın set + ranking-eval; ağırlık ayarı                                                              | Ali yazar, Claude koşar | 1 gün    |
| 10  | Vercel'e anahtarlar, canlı test                                                                      | Ali                     | 0,5 saat |

Toplam: yaklaşık bir hafta. Cepten çıkan para: DeepSeek profilleri için < 1 $; Google ve Tripadvisor kotalarının içinde kalınır (kart tanımlı olur ama harcama sıfır; günlük bütçe limitleri her iki panelde de kapatılır).

## 7. Kararlar ve açık sorular

Karar verildi (14 Eylül): Bakü dışı gidilir mekanlar dahil (15 kota); eski veri silinir; üç kaynak birden; öneri sistemi Ali + Claude.

Açık:

1. Bar/pub sayısı 40 yeterli mi, yoksa "arkadaşlarla bira" senaryosu için 60 mı?
2. Google'ın 30 günlük saklama kuralı ve Apify yoluyla alınan yorumlar için hukuki teyit kimden alınacak? (Ham yorumlar arayüzde gösterilmez; profil türev içerik.)
3. Tripadvisor atıf görselleri arayüzde nereye konacak (mekan detayı alt kısmı önerilir).

## Kaynaklar

- Google Places API (New) kullanım ve faturalama: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Google Places ücretsiz kota özeti (SKU başına aylık 10.000 / 5.000 / 1.000): https://www.mapsleads.co/blog/google-places-api-limits-2026-complete-reference
- Tripadvisor Content API SSS (5.000 ücretsiz çağrı/ay, günlük limit, atıf): https://tripadvisor-content-api.readme.io/reference/faq
- Tripadvisor Content API genel bakış (mekan başına 5 yorum ve 5 fotoğraf): https://tripadvisor-content-api.readme.io/reference/overview
- Apify ücretsiz plan (aylık 5 $ kredi) ve Google Maps Reviews Scraper fiyatı (yorum başına ≈ 0,0006 $): https://use-apify.com/docs/what-is-apify/apify-free-plan , https://apify.com/compass/google-maps-reviews-scraper
