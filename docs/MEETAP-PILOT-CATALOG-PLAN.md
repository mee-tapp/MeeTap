# Meetap – Pilot Katalog Planı (Bakü, 250–300 mekan)

> Taslak: 14 Eylül 2026. Ali'nin yön değişikliği önerisinin toparlanmış hâli. Onaylandıktan sonra README bölüm 2 ve MEETAP-TASKS.md buna göre yeniden yazılacak; kod yazımı ondan sonra başlar.

## 0. Neden yön değiştiriyoruz

MVP'nin tek sorusu: **"LLM'li öneri sistemimiz iyi mi?"** Bunu ölçmek için mekanların iyi bilinmesi gerekir. Bugünkü 87.665 açık veri kaydı (OSM + Overture) bunu vermiyor:

- Mekanın **kalitesi** yok (puan, yorum yok). Motor "doğru türde mekan"ı bulabiliyor ama "iyi mekan"ı ayırt edemiyor.
- Etiketler seyrek ve tutarsız: Bakü'de 3.263 restoranın 88'i "azerbaijani", 1.935'inin mutfağı hiç yok.
- Her test cümlesi yeni bir boşluk çıkarıyor (kabinet, xəngəl, şirniyyat…) ve her seferinde motora özel kural ekliyoruz. Kategori bitmez; **kapalı bir katalog şemasına** geçmeden bu döngü kapanmaz.

Yeni ilke: **Az ama tam bilinen mekan.** Bakü'de 250–300 mekan, her biri aynı şemayla doldurulmuş, her birinin gerçek yorumu ve puanı var. Öneri sistemi bu katalog üstünde ölçülür; iyi çalışırsa aynı tarifle büyütülür (Bakü 1.000, sonra İstanbul).

Mevcut 87k kayıt silinmez: `venues` tablosunda kalır, `explore` sayfası ve harita için yedek olur; öneri motoru ise yalnızca `catalog_tier = 'pilot'` işaretli mekanlar üzerinde çalışır. Böylece "temizlik" bir silme değil, bir **seçme** işidir.

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

Kural: yalnızca resmi API'ler ve elle giriş. Google Maps veya Tripadvisor sayfalarını scrape eden, bot korumasını aşan araç kullanmıyoruz (hem hizmet şartlarına aykırı hem yatırımcı incelemesinde risk). Yatırım sonrası ücretli veri anlaşmaları (Wolt, sosyal medya) ayrı başlık.

### Adım A – Aday listesi (Google Places API New, Text Search)

- Google Cloud'da proje + faturalama hesabı (kart ister; ücretsiz kotalar SKU başına aylık: Essentials 10.000, Pro 5.000, Enterprise 1.000 çağrı). 300 mekan bu kotaların çok altında.
- Tür × semt bazında Text Search ("restaurants in Nizami Baku", "coffee in Sahil Baku"…): ad, koordinat, `rating`, `userRatingCount`, `priceLevel`, `types`, `place_id`. ~60 sorgu, ~1.200 aday.
- Yorum sayısı ve puana göre sıralayıp bölüm 2'deki dağılıma göre 300'e indir; CSV'ye yaz.

### Adım B – Mekan detayı (Google Place Details, Enterprise alanları)

- Her mekan için tek çağrı, alan maskesiyle: çalışma saatleri, `priceLevel`, `reviews` (en fazla 5), `outdoorSeating`, `liveMusic`, `reservable`, `goodForChildren`, `goodForGroups`, `servesBreakfast/Brunch/Lunch/Dinner/Dessert/Coffee/Wine/Beer/Cocktails/VegetarianFood`, `parkingOptions`, `accessibilityOptions`, `editorialSummary`. 300 çağrı = aylık 1.000 Enterprise kotasının içinde.
- **Saklama kuralı:** Google Maps Platform şartları Places içeriğinin (place_id hariç) en fazla 30 gün önbelleklenmesine izin verir. Bu yüzden Google'dan gelen ham alanlar aylık yenilenir (300 çağrı, ücretsiz); yorumların kendisi ham olarak saklanmaz, LLM ile üretilen **profil** (bizim türev içeriğimiz) saklanır. Bu ayrımı hukuken bir kez teyit ettirmek gerekir.

### Adım C – Tripadvisor Content API (Nihat'ın katmanı)

- Ücretsiz 5.000 çağrı/ay, kart gerekli, mekan başına 5 yorum + puan + sıralama + `cuisine` + `features` ("Private Dining", "Reservations", "Seating", "Serves Alcohol", "Wheelchair Accessible"…) + `meal_types` + `dietary_restrictions`. Atıf zorunlu (logo/bubble görseli, mekan sayfasında gösterilecek).
- Eşleştirme: ad + koordinat (mevcut `scripts/enrich/tripadvisor.mjs`). 300 mekan × (search + details + reviews) ≈ 900 çağrı.
- Böylece mekan başına en az 10 gerçek yorum (5 Google + 5 Tripadvisor), iki ayrı puan ve özellik listesi olur. Hangi kaynağın "daha iyi" olduğunu seçmeye gerek yok: ikisi de alınır, profil ikisinden üretilir, arayüzde iki puan da kaynağıyla gösterilir.

### Adım D – LLM profili (DeepSeek, ~0,3 $ toplam)

- Girdi: 10 yorum + Google/Tripadvisor özellik alanları + tür/mutfak. Çıktı (JSON, zod ile doğrulanır): `good_for`, `features` (yorumda geçen kabinet/karaoke/manzara…), `signature_dishes`, `aspects` (yemek, servis, atmosfer, fiyat/performans, temizlik puanları), `cautions`, 2–3 cümle özet. Mevcut `venue_intelligence` tablosu ve `scripts/enrich/profile-llm.mjs` bunun için yeniden kullanılır; şema bölüm 1'e göre genişletilir.
- İlke korunur: LLM sadece **gerçek yorumlardan** çıkarım yapar, yorum yoksa alan boş kalır.

### Adım E – Elle kalite turu (Ali + Nihat, 2–3 saat)

- 300 satırlık tablo: tür, mutfak, fiyat, `features` (özellikle `private_room`, `karaoke`, `sea_view`), `good_for`. Yanlışlar düzeltilir, eksikler doldurulur. Kabinet gibi yerel bilgi Google'da alan olarak yok; Tripadvisor "Private Dining" + yorum metni + elle bilgi birleşince pilot için yeterli.
- Bu tablo `data/catalog/baku-pilot.csv` olarak repoda tutulur ve `scripts/catalog/load-pilot.mjs` ile yüklenir: **bizim ilk ham verimiz** budur.

### Adım F – Büyüme (pilot sonrası, hâlâ ücretsiz)

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

| #   | İş                                                                                     | Kim                     | Süre     |
| --- | -------------------------------------------------------------------------------------- | ----------------------- | -------- |
| 1   | Google Cloud projesi + Places API anahtarı; Tripadvisor anahtarı (`.env`, asla commit) | Ali                     | 1 saat   |
| 2   | Şema onayı (bölüm 1) ve dağılım (bölüm 2)                                              | Ali + Nihat             | 1 saat   |
| 3   | `scripts/catalog/google-candidates.mjs` (Adım A) → CSV                                 | Claude                  | 0,5 gün  |
| 4   | Elle seçim: 300 mekan                                                                  | Ali + Nihat             | 1 saat   |
| 5   | `google-details.mjs` (Adım B) + Tripadvisor eşleştirme (Adım C)                        | Claude + Nihat          | 1 gün    |
| 6   | Profil üretimi (Adım D), şema migration'ları, yükleme                                  | Claude                  | 1 gün    |
| 7   | Elle kalite turu (Adım E)                                                              | Ali + Nihat             | 3 saat   |
| 8   | Motor değişiklikleri (bölüm 4)                                                         | Claude                  | 2 gün    |
| 9   | Altın set + ranking-eval; ağırlık ayarı                                                | Ali yazar, Claude koşar | 1 gün    |
| 10  | Vercel'e anahtarlar, canlı test                                                        | Ali                     | 0,5 saat |

Toplam: yaklaşık bir hafta. Cepten çıkan para: DeepSeek profilleri için < 1 $; Google ve Tripadvisor kotalarının içinde kalınır (kart tanımlı olur ama harcama sıfır; günlük bütçe limitleri her iki panelde de kapatılır).

## 7. Açık sorular (Ali karar verir)

1. Bakü dışı "gidilir" mekanlar (Bilgəh, Novxanı plajları) pilota girsin mi? Öneri: 10–15 tane, `features: sea_view/outdoor` ile.
2. Bar/pub sayısı 40 yeterli mi, yoksa "arkadaşlarla bira" senaryosu için 60 mı?
3. Google'ın 30 günlük saklama kuralı için hukuki teyit kimden alınacak? (Profil türev içerik olarak saklanacak; ham yorum saklanmayacak — bu varsayımla ilerliyoruz.)
4. Tripadvisor atıf görselleri arayüzde nereye konacak (mekan detayı alt kısmı önerilir; tasarım değişmez, sadece küçük bir satır).

## Kaynaklar

- Google Places API (New) kullanım ve faturalama: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Google Places ücretsiz kota özeti (SKU başına aylık 10.000 / 5.000 / 1.000): https://www.mapsleads.co/blog/google-places-api-limits-2026-complete-reference
- Tripadvisor Content API SSS (5.000 ücretsiz çağrı/ay, günlük limit, atıf): https://tripadvisor-content-api.readme.io/reference/faq
- Tripadvisor Content API genel bakış (mekan başına 5 yorum ve 5 fotoğraf): https://tripadvisor-content-api.readme.io/reference/overview
