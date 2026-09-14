# Meetap – Etap Etap Görev Planı

Notion'a içe aktarılabilir (Import → Markdown). Her görevin başındaki kutu tamamlanınca işaretlenir. Bu dosya kaynak; Notion bağlayıcısı yetkilendirilince aynı liste oradan güncellenecek.
Durum: ⬜ yapılmadı · 🟨 devam ediyor · ✅ bitti · ⏸ karar bekliyor

Kurallar:

- Onaylı arayüz tasarımı (stil, sayfa düzeni) değişmez. Sadece veri kaynağı ve mantık değişir.
- Sahte mekan yok. Her kayıt gerçek bir açık veri kaydına bağlıdır.
- Sıfır bütçe: sadece ücretsiz katman ve açık veri.
- İçerik kaldırma / "yakında" gibi kararlar Ali'ye sorulur.

---

## Etap 0 – Kararlar ve altyapı (Hafta 1)

- [x] ✅ Pilot şehir ve bölge seçimi — **Karar (2026-09-11): İstanbul'un tamamı + Bakü'nün tamamı.** Elle gözden geçirme merkez ilçelerden başlar.
- [x] ✅ Supabase ücretsiz proje açıldı, `.env` dolduruldu (bölge: ap-northeast-2 Seul; gecikme ~250 ms, ileride Frankfurt'a taşınabilir)
- [x] ✅ LLM anahtarı: DeepSeek (deepseek-chat) seçildi ve bağlandı — ücretsiz değil ama çok ucuz
- [x] ✅ `.env` ve `.env.local` dosyalarının `.gitignore`'a eklenmesi
- [x] ✅ Veritabanı şeması (mekanlar, mutfaklar, etiketler, kullanıcılar, ziyaretler, puanlar, sorgu logları) — SQL migration dosyası
- [x] ✅ PostGIS etkinleştirme ve mesafe sorgusu için index

## Etap 1 – Gerçek veri boru hattı (Hafta 2–3)

- [x] ✅ OpenStreetMap (Overpass) içe aktarma betiği: bbox → kafe/restoran/bar/aktivite listesi
- [x] ✅ Overture Maps Places içe aktarma betiği (kategori, web sitesi, güven skoru)
- [x] ✅ İki kaynağın isim + mesafe ile eşleştirilip birleştirilmesi (dedupe)
- [x] ✅ Kategori normalizasyonu → arayüzdeki 4 kategori (Cafés, Restaurants, Bars, Activities)
- [ ] 🟨 Mutfak alanının normalizasyonu (kebab, sushi, home_cooking, seafood, …) — Overture kategorisinden ve OSM cuisine alanından çıkarılıyor; alias tablosu genişletilecek
- [ ] Çalışma saatlerinin ayrıştırılması ("şu an açık mı")
- [ ] 🟨 Fiyat bandı tahmini (kategori + semt + zincir heuristiği; "tahmini" etiketli) — şimdilik sadece Overture kategorisine göre 1–4 bandı
- [ ] 🟨 Ortam etiketlerinin toplu üretimi — `scripts/tag/ambiance-llm.mjs` (DeepSeek, ~4 sent / 1.000 mekan); merkez 3 km pilotu tamamlandı: İstanbul 7.319 + Bakü 2.708 mekan etiketlendi, ~53 "mekan değil" kaydı kapatıldı, toplam ~0,45 $; kalan ~77.000 mekan için onay bekleniyor (~3,5 $)
- [ ] En popüler ~200 mekanın elle gözden geçirilmesi (Ali + ekip)
- [x] ✅ Supabase'e yükleme betiği (`scripts/db/apply-migrations.mjs`, `scripts/db/load-venues.mjs`) — şema kuruldu, Bakü 7.234 mekan yüklendi
- [ ] Aylık tazeleme görevi (GitHub Actions cron)
- [ ] Veri kaynağı atıfları (OSM ODbL, Overture CDLA) için footer/hakkında metni — **Ali'ye sorulacak**

## Etap 1b – Yorum verisi ve mekan profilleri (karar: 2026-09-12)

- [ ] ⏸ Tripadvisor Content API anahtarı (resmi, ayda 5.000 çağrı ücretsiz, kredi kartı + günlük bütçe limiti) — **Ali açar, `.env`'e `TRIPADVISOR_API_KEY` koyar**
- [x] ✅ Çekme betiği hazır: `scripts/enrich/tripadvisor.mjs` (puan, yorum sayısı, fiyat seviyesi, özellikler, son 5 yorum; mekan başı ~3 çağrı → ayda ~1.600 mekan ücretsiz)
- [ ] Yorumlardan DeepSeek ile mekan profili: "balık için iyi, romantik, servis yavaş" (`venues.profile`, `good_for[]`)
- [ ] Sıralamanın profil ve `good_for` alanlarını kullanması; açıklamada "yorumlara göre …"
- [ ] Sıralama test seti: 30 cümle, Ali'nin "doğru mekan geldi mi" puanlaması
- [ ] Google Places (New) ile tamamlama — yatırım sonrası (yorumlar ayda 1.000 çağrı ücretsiz, sonrası ücretli)
- [ ] Foursquare tips (ücretsiz) — ikinci kaynak olarak değerlendirilecek

## Etap 2 – Öneri motoru v1 (Hafta 3–4)

- [x] ✅ Niyet şeması (purpose, cuisines[], ambiance any-of/all-of, budget, group_size, transport, hard/soft ayrımı)
- [x] ✅ LLM niyet çözümleyici (DeepSeek, JSON çıktı, zod doğrulama, kural tabanlı yedek) — `src/lib/recommend/llm-parser.ts`
- [x] ✅ Kural tabanlı Türkçe yedek çözümleyici (sakin/sessiz → quiet, canlı müzik → live_music, ucuz/pahalı olmasın → budget low, …)
- [ ] Çözümlenen niyet önbelleği (aynı cümle → LLM'e gitme)
- [x] ✅ Aday çekme: şehir + yarıçap + kategori (PostGIS `venues_nearby`), az sonuçta yarıçap otomatik genişler — açık olma bilgisi henüz yok
- [x] ✅ Puanlama fonksiyonu: bütçe uyumu, mesafe, ortam örtüşmesi, amaç uyumu, hava uyumu, kalite (Bayes düzeltmeli)
- [x] ✅ Ağırlık tablosu tek yerde, ayarlanabilir
- [x] ✅ Şablon açıklama üretimi ("Bütçene uygun · 8 dk yürüme · sakin")
- [ ] Artı/eksi (trade-off) çıkarımı: ilk 3 sonuç için "daha ucuz ama kalabalık" tarzı karşılaştırma
- [x] ✅ Kapsama raporu: kontrol edilebilen / edilemeyen kriterler (`coverage`), eşlenemeyen istekler puanlamadan çıkar ve arayüzde "Not in our data yet, so not checked: …" notu; çok mutfaklı istekte ana mutfak önce, kısmi eşleşme açıklanır; uzak sonuçlarda "arabayla ~X dk" ve ayrı not
- [x] ✅ LLM düşüş nedeni telemetrisi (`query_logs.parser_error`, migration 0015) + arayüzde "Basic understanding mode" notu
- [x] ✅ Vercel ortam değişkenleri: `LLM_PROVIDER`, `DEEPSEEK_API_KEY` (Nihat, 14 Eylül; canlıda `parser: llm` doğrulandı)
- [x] ✅ Sunucu fonksiyonları (`src/lib/venues/server.ts`): recommendVenues, fetchVenues, fetchFeatured, fetchVenue, submitReview
- [x] ✅ Open-Meteo hava durumu entegrasyonu — `src/lib/weather.ts`
- [x] ✅ Ana sayfa arama kutusu gerçek motora bağlı (animasyon aynı, sonuç kartı gerçek mekan + gerçek hava + tahmini bütçe + mesafe); öne çıkanlar ve harita pinleri gerçek
- [x] ✅ Keşfet sayfası veritabanından besleniyor (kategori, ruh hali, bütçe, mesafe, arama filtreleri sunucu tarafında)
- [x] ✅ Mekan detay sayfası veritabanından; fotoğrafsız kart, "No ratings yet", "Be the first to review", yorum yazma canlı (isim opsiyonel)
- [x] ✅ İstatistikler gerçek: Places listed, Cities (verisi olan şehir sayısı), Searches (yapılan arama sayısı), Avg. rating (yorum yoksa —); alt kartta gerçek puan ve yorum sayısı; ana sayfada "N searches and counting"

## Etap 3 – Harita ve rota (Hafta 5)

- [ ] MapLibre + OpenFreeMap karo entegrasyonu (mevcut dekoratif SVG korunur)
- [x] ✅ Konum izni akışı: ana sayfa aramasında tarayıcıdan konum istenir, verilmezse veya 3,5 sn içinde gelmezse şehir merkezi kullanılır; sonuç kartında "From you / From city centre" yazar
- [ ] OpenRouteService ile yürüme / araç rotası, süre ve mesafe
- [ ] Detay sayfasında rota gösterimi
- [ ] Nominatim ile adres arama (opsiyonel)

## Etap 4 – Hesap, geçmiş ve puanlar (Hafta 6)

- [ ] Supabase Auth (e-posta + Google)
- [ ] Kaydedilen mekanlar (şu an sayfa yenilenince kayboluyor)
- [ ] History: gidilen yerler, tarih, harcanan tutar, puan
- [ ] Kullanıcı puanlarının sıralamaya girmesi
- [ ] "Kapanmış / bilgi yanlış" bildirimi
- [x] ✅ Sahte yorum ve puan dağılımları kalktı (karar: fotoğrafsız kart, "henüz puan yok", "ilk yorumu sen yaz")

## Etap 5 – Ölçüm ve iyileştirme (sürekli)

- [x] ✅ Sorgu → niyet → sonuç → tıklama loglama (`query_logs`; "View" tıklaması `clicked_venue_id` olarak yazılır)
- [ ] 🟨 Haftalık yanlış çözümlenen cümle incelemesi — test seti kuruldu: `scripts/eval/intent-cases.json` (20 cümle) + `node scripts/eval/intent-eval.mjs [--llm]`; kurallar 20/20, DeepSeek 19/20. Yanlış anlaşılan her gerçek cümle bu dosyaya eklenir
- [ ] Ağırlık ayarı (gerçek tıklamalara göre)
- [ ] Basit kişiselleştirme (geçmiş tercihlere göre ağırlık kaydırma)

## Yatırım sonrası (ücretli)

- [ ] Google Places canlı puan / fotoğraf zenginleştirme
- [ ] Toplu taşıma rotası
- [ ] Daha güçlü LLM (Claude)
- [ ] Çiftler & arkadaşlar modu (orta nokta bulma)
- [ ] Avatar sistemi, fırsatlar, etkinlik planlama

---

## Çalışma günlüğü

- **2026-09-11** — Kadıköy pilot örneği: OSM 1.026 + Overture 3.045 gerçek mekan → birleştirilince 3.423 mekan (637'si iki kaynakta da var). Bakü merkez OSM örneği: 752 mekan. Kural tabanlı çözümleyici + puanlama gerçek Kadıköy verisiyle uçtan uca çalışıyor (`node scripts/recommend-smoke.mjs`).
- **2026-09-11 (akşam)** — Pilot = iki şehrin tamamı. Bakü tamamı: OSM 2.431 + Overture 5.485 → 7.234 mekan. İstanbul tamamı: Overture 72.670 mekan (OSM indirmesi sürüyor). Overture için akışlı, kategori filtreli Python betiği eklendi (`scripts/data/fetch-overture.py`).
- **2026-09-11 (gece)** — Supabase şeması kuruldu, Bakü 7.234 mekan yüklendi. DeepSeek niyet çözümleyici canlı (1–2 s). Uçtan uca canlı öneri çalışıyor: cümle → DeepSeek → Open-Meteo → PostGIS adaylar → puanlama → açıklama, ~5 s. Overpass sunucuları İstanbul için yanıt vermediğinden Geofabrik Türkiye dosyası (645 MB) indirildi, yerel süzme betiği eklendi (`scripts/data/fetch-osm-pbf.py`).
- **2026-09-12 (akşam)** — Nihat: venue intelligence katmanı, Tripadvisor pilotu (Nergiz), Google fotoğraf pilotu, Vercel deploy. Ali'nin testleri üzerine: açık mutfak sözlüğü, dürüst açıklamalar, konum izni düzeltmesi, fiyat seviyesi gösterimi, şube tekilleştirme. Scaffold kalıntıları temizlendi (AGENTS.md, bun dosyaları, editör hata raporlama); build preset paketi deploy riski yüzünden kaldı.
- **2026-09-12** — "Deniz kenarı" artık coğrafi gerçek: Overture su poligonlarından kıyı çizgisi çıkarıldı, her mekanın kıyıya uzaklığı hesaplandı (İstanbul 6.316, Bakü 211 mekan ≤150 m). Niyet sözlüğüne `seaside` eklendi. Ana sayfa kartı 3 sonuç gösteriyor. Kategori söylenmezse varsayılan kafe/restoran/bar. Kural çözümleyici için 20 cümlelik değerlendirme seti eklendi.
- **2026-09-11 (geç gece)** — Arayüz gerçek veriye bağlandı (ana sayfa arama + öne çıkanlar, keşfet, detay + yorum). Tasarım dosyalarına dokunulmadı; sadece veri kaynağı değişti, fotoğraf yerine kategori ikonu, "No ratings yet" ve "Be the first to review" durumları eklendi. İstanbul tamamı: OSM 15.030 + Overture 72.670 → 80.431 mekan birleştirildi ve Supabase'e yüklendi (toplam 87.665 gerçek mekan). Dev sunucusunda uçtan uca doğrulandı (Bakü).

- **2026-09-12 (gece)** — Ali'nin Azerice test cümlesi (yıl dönümü + tatlı + Azerbaycan mutfağı + kabinet + orta bütçe) incelendi. Kök neden: canlı sitede DeepSeek hiç çalışmıyor, Vercel'de anahtar tanımlı değil (`query_logs.parser` hep `rules`; tarayıcıdan doğrulandı). Genel çözüm: kapsama raporu (anlaşılan ama verisi olmayan istekler puanlanmaz, kullanıcıya söylenir), çok mutfaklı istekte ana mutfak ağırlığı, "uzak (arabayla ~X dk)" ifadesi, LLM düşüş nedeni telemetrisi ve "basic understanding mode" notu, dil algılamada İngilizce cümlelerdeki Türkçe özel isimlerin ("Kadıköy") yanlış tetiklemesi düzeltildi. LLM istemine "eşleyemediğini yaklaştırma, `unmapped`'e yaz" kuralı eklendi (kabinet ≠ indoor). Test seti: kurallar 25/25, DeepSeek 24/25 (değişmedi). Yerelde arayüzden doğrulandı: aynı cümle Bakü'de Sahil Bar & Restaurant / Мимино / Sumakh + "Not in our data yet, so not checked: kabinet" notu. Ek genel kural: şehrin kendi mutfağı için "local/regional/home_cooking" etiketleri kanıt (ad/etiket çelişkisi yoksa); 3 km'den kaba tarayıcı konumu yok sayılır.

- **2026-09-12 (gece, 2)** — Ali: "mesafe sıralamayı belirlemesin, yıl dönümü için bar önerme". Mesafe ağırlığı 1.1 → 0.4, istenen mutfak/ortam şehir genelinde aranıyor; amaç–mekan tipi kuralı eklendi (bar/pub/nargile, fast food/büfe, düğün salonu randevu/iş için elenir; aile/çalışma için bar elenir). Aynı cümle Bakü'de artık Sumakh / Мимино / Dolma; "Sahil Bar & Restaurant" ve "Nargile Çay Evi" tipi sonuçlar randevu için aday olamıyor. Konum uzaksa şehir merkezi havuzu da aday, mesafe puanı yumuşak azalıyor, tarayıcı konum doğruluğu kaydediliyor.

## NEREDE KALDIK (2026-09-14, gece)

Katalog canlı: Apify ile 771 aday (merkez + Bilgəh/Mərdəkan/Novxanı/Nardaran), otomatik seçimle 181 mekan, yerel `gosom/google-maps-scraper` ile yorumlar (mekan başına ~5–8), Google puanı ve yorum sayısı, Azerice olanaklar (kabinet = "Xüsusi nahar otağı"). 180 mekan + 900 yorum Supabase'de (`catalog_tier='pilot'`). Motor kapalı şemaya geçti: `features` (kabinet, karaoke, canlı müzik…), `meals`, `dish` (yorum metinlerinde arama: "xəngəl" → Xəngəlation), Google puanı kalite sinyali, `good_for` verisi amaç kanıtı. Test seti: kurallar 25/25, DeepSeek 25/25.

Tamamlandı: 181 mekanın tek eşzamanlılıkla yeniden çekimi (kabinet bilgisi 48 mekanda, fiyat aralığı 133 mekanda) ve kafe/tatlıcı turu (91 mekan). Sonra: LLM profil (imza yemekler), Ali'nin 40 cümlelik altın seti, Tripadvisor ikinci puan (anahtar gelince).

## NEREDE KALDIK (2026-09-14)

Ali'nin kararı: 87k açık veri silinir; Bakü'de 250–300 yorumu bol mekanla kapalı şemalı katalog; kaynaklar Google Places API + Apify yorumları + Tripadvisor API; Bakü dışı gidilir mekanlar dahil; öneri sistemi Ali + Claude. Plan: `docs/MEETAP-PILOT-CATALOG-PLAN.md`.

Yapıldı: migration 0021 (katalog kolonları, `venues_nearby` `p_tier`), `src/lib/catalog/taxonomy.ts` (kapalı listeler + Google/Tripadvisor eşlemeleri), `scripts/catalog/{google-candidates, select-pilot, google-details, apify-reviews, merge-external}.mjs`, `scripts/db/reset-venues.mjs`; motor artık yalnızca `catalog_tier='pilot'` mekanlarla cevap verir.

Eski veri silindi; Vercel'de DeepSeek çalışıyor (doğrulandı). Kaynak sadeleşti: yalnızca Apify Google Maps Scraper (`apify-places.mjs --search / --details`), tek anahtar `APIFY_TOKEN`. Sırada (Ali): Apify'da ücretsiz hesap, token `.env`'e. Sonra Claude Adım A'yı koşar, Ali `keep` sütununu düzeltir, Claude detay + yorumları yükler, kalite turu, motor kapalı şemaya geçer, altın set ölçümü.

## NEREDE KALDIK (2026-09-12, gece)

**Önce Vercel'e `LLM_PROVIDER=deepseek` ve `DEEPSEEK_API_KEY` eklenmeli**; bu yapılmadan canlı sitedeki hiçbir test DeepSeek'i ölçmüyor (her arama `parser = rules`).

Bugün eklenen genel kurallar (ayrıntı ve neden tablosu: README → Geliştirici Rehberi → bölüm 1b):

- **Amaç, mekan tipini belirler:** bar/pub/nargile, fast food/büfe, düğün salonu randevu ve iş yemeği için aday olamaz; aile/çalışma için bar ve salon elenir. Açıkça bar istenirse bar kalır.
- **Mesafe gösterilir, karar vermez:** ağırlık 0.4, istenen mutfak/ortam şehir genelinde aranır, uzak sonuç "uzak (arabayla ~X dk)" diye yazılır.
- **Kapsama raporu:** verisi olmayan istekler puanlanmaz, kartta "Not in our data yet, so not checked: …" yazar.
- **Şehrin kendi mutfağı:** Bakü'de "local/home_cooking" etiketleri Azerbaycan mutfağı kanıtı (ad/etiket çelişkisi yoksa).
- **Konum:** 3 km'den kaba tarayıcı konumu yok sayılır; doğruluk kaydedilir ve kartta "±X km" görünür.

Önceki günden korunanlar: açık mutfak sözlüğü, kanıta göre ifade ("uygun görünüyor" / "iyi"), konum izni bekleme, fiyat seviyesi, şube tekilleştirme, Nihat'ın venue intelligence katmanı (`VENUE_INTELLIGENCE_ENABLED`). Test seti: kurallar 25/25, DeepSeek 24/25.

Açık karar: yorum verisi kaynağı (Tripadvisor API + sınırlı scraper önerisi). Anahtar `.env`'e girince `scripts/enrich/tripadvisor.mjs`, sonra profil üretimi, sonra sıralamanın profilleri kullanması, sonra 30 cümlelik sıralama testi.

## Sıradaki işler (öncelik sırasıyla — README bölüm 2 ile aynı)

0. Yorum verisi kaynağı kararı → Tripadvisor eşleştirme + profil üretimi → sıralamada "yorumlara göre" → 30 cümlelik sıralama testi

1. Ortam etiketlerinin LLM ile toplu üretimi (şu an sadece kategori ipucu; "manzaralı", "romantik" gibi istekler çoğu mekanda eşleşemiyor)
2. Kategori temizliği (düğün salonu, vize ofisi, kantin gibi kayıtların restoran listesinden çıkarılması) — ilk adım atıldı: puanı olmayan mekanlarda Overture güven skoru kalite sinyali olarak kullanılıyor
3. Keşfet sayfasında da konuma göre mesafe (şu an şehir merkezinden)
4. Çalışma saatleri ayrıştırma ("şu an açık mı")
5. Harita ve rota (Etap 3)

## Karar bekleyenler (Ali)

| Konu                                                      | Seçenekler                    | Durum                          |
| --------------------------------------------------------- | ----------------------------- | ------------------------------ |
| Pilot bölge                                               | İstanbul tamamı + Bakü tamamı | ✅ karar verildi               |
| Supabase projesi                                          | açıldı                        | ✅                             |
| LLM anahtarı                                              | DeepSeek                      | ✅ yerelde; Vercel'e girilecek |
| Veri yokken şehir kartları (Londra, NY, Barselona, Paris) | kalsın / kaldır / "yakında"   | ⏸ sonra sorulacak              |
