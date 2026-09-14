Meetap - less hesitation, more destination
Meetap is an AI-powered venue recommendation platform designed to eliminate the common dilemma: "Where should we go?"

Instead of switching back and forth between map services, review platforms, and weather apps, users simply type what they want to do in plain, everyday language. Meetap finds the most practical spots and explains why each place makes sense.

Core Concept & Philosophy
Meetap is not just a standard search directory or a rigid filter menu. The system is designed to answer one central question: "What is the best place for the user to go right now, given their current circumstances?"

For example, a user might enter:

"Meeting up with friends, our budget is around 300 TL per person, it's raining outside, and we need a quiet indoor spot nearby."

Rather than returning a raw list of pins, Meetap analyzes these constraints and presents venues alongside clear decision rationales:

Venue A: Matches your budget, very close, and quiet. Ideal for rainy weather.

Venue B: Cheaper and closer, but might be slightly crowded right now.

Venue C: Great atmosphere matching your vibe, but slightly exceeds your budget target.

This format eliminates decision paralysis by letting users weigh trade-offs immediately.

How It Works (Technical Overview)
Meetap processes raw user intent through a multi-stage context pipeline:

Plaintext
[ User Input ] (Natural Language Text / Quick Tags)
│
▼
[ NLP / LLM Layer ] ──► Extracts entities into structured JSON (Intent, Budget, Vibe)
│
▼
[ Context & API Layer ] ──► Fetches real-time signals (Live Weather, GPS, Distance)
│
▼
[ Multi-Factor Scoring ] ──► Weighted ranking (Proximity, Cost, Atmosphere, Rating)
│
▼
[ Decision & Route UI ] ──► Returns ranked venues with rationales + interactive route
Natural Language Parsing (NLP / LLM): Unstructured text is transformed into structured criteria (purpose, budget limits, group size, required atmosphere like "quiet" or "lively").

Environmental Data Aggregation: Real-time external variables are fetched via APIs (current precipitation, temperature, user GPS coordinates).

Multi-Constraint Scoring Algorithm: Database candidates are ranked through weighted factors. If rain is detected, open terraces are down-ranked; if budget is tight, higher-priced venues receive negative weights.

Interactive Routing: Selected options display transit modes (walking, driving, transit), estimated arrival times, and turn-by-turn routes without requiring a separate map application.

Session History & Feedback: Visited spots and user ratings are persisted to refine weights for future recommendations.

Future Roadmap
Midpoint Finder: An algorithm to calculate a fair, equidistant meeting point for two or more users starting from different locations.

Social Map & Avatars: Real-time friend status indicators and shared destination pins.

Adaptive Personalization: Continuous scoring adjustments based on user acceptance, dismissal, and historical review patterns.

---

# Geliştirici Rehberi (Türkçe)

> 12 Eylül 2026 itibarıyla projenin gerçek durumu. Yukarıdaki İngilizce metin ürün vizyonu, aşağıdaki teknik gerçektir. Günlük "nerede kaldık" notları `docs/MEETAP-TASKS.md` dosyasının başında.

## 1. Yapılanlar

- **Gerçek mekan verisi.** İstanbul'un tamamı (80.431) ve Bakü'nün tamamı (7.234) Supabase/PostGIS'te. Kaynak: OpenStreetMap + Overture Maps (açık veri). Sahte mekan yok; her kayıt kaynağına bağlı (`venue_sources`).
- **Cümleyi anlama.** DeepSeek serbest metni yapılandırılmış niyete çevirir (amaç, mutfak, ortam, bütçe, kişi sayısı, ihtiyaçlar, eşlenemeyen istekler). DeepSeek yoksa kural tabanlı Türkçe/İngilizce çözümleyici devreye girer, arayüz "Basic understanding mode" notu gösterir ve neden düştüğü `query_logs.parser_error`'a yazılır. Mutfak sözlüğü açık: Özbek, Gürcü, Lübnan gibi listede olmayan mutfaklar da çalışır. 25 cümlelik test seti: kurallar 25/25, DeepSeek 24/25.
- **Sıralama.** Deterministik puanlama, LLM mekan seçmez. Ağırlıklar: mutfak 2.5 (zorunluluk), amaç 1.6, ortam 1.5, bütçe 1.3, hava 0.8, kalite 0.8, ihtiyaçlar 0.6, mesafe 0.4. Açıklamalar puan bileşenlerinden üretilir ve kanıta göre ifade değişir ("uygun görünüyor" = LLM tahmini etiket, "iyi" = insan verisi).
- **Amaç, mekan tipini belirler.** Açık veri tipi, kategori ve addaki tam kelimeden mekan türü çıkarılır: bar/pub/lounge/nargile/club, fast food/büfe/kantin/lokal, düğün/şadlıq salonu. Randevu ve iş yemeği için üçü de aday olamaz; aile ve çalışma için bar ve salon elenir, fast food düşük puan alır; kullanıcı açıkça bar istediyse bar kalır. Tablo: `PURPOSE_KIND_RULES` (`src/lib/recommend/scoring.ts`).
- **Mesafe gösterilir, karar vermez.** İstenen mutfak ve ortam şehir genelinde aranır; sonuç uzaksa "uzak (arabayla ~25 dk)" diye yazılır ve kullanıcıya bırakılır. Kullanıcının konumundan 1 saat yürüme içinde istenen mutfağı veren yer yoksa şehir merkezi havuzu da aday olur ve ayrı bir not çıkar. Mesafe puanı sıfıra çakılmaz, yumuşak azalır.
- **Kapsama raporu (dürüstlük).** Her arama, isteğin hangi parçalarının gerçek veriyle kontrol edildiğini ve hangilerinin edilemediğini döndürür (`coverage`). Eşlenemeyen istekler ("kabinet", "tatlıları güzel olsun"), havuzda hiçbir mekanda olmayan ortam etiketleri ve verisi olmayan ihtiyaçlar (helal, tekerlekli sandalye) puanlamaya girmez; kartın üstünde "Not in our data yet, so not checked: …" yazar. Uydurma eşleşme yok.
- **Şehrin kendi mutfağı.** Bakü'de "Azerbaycan mutfağı", İstanbul'da "Türk mutfağı" istenince açık verideki "local / regional / home_cooking" etiketleri de kanıt sayılır ("yerel mutfak", düşük ağırlık); adı veya etiketi başka mutfak söyleyen mekanlar (Gürcü Mətbəxi, Anadolu Restaurant) hariç. Birden fazla mutfak istenirse ilk yazılan ana mutfaktır; kısmi eşleşme "Azerbaycan mutfağı var (tatlı bilgisi yok)" diye açıklanır.
- **Konum.** Arama kutusuna odaklanınca izin istenir ve beklenir. Tarayıcı konumu 3 km'den kabaysa (IP tahmini) şehir merkezi kullanılır; doğruluk `query_logs.user_location_accuracy_m`'e yazılır ve kartta "From you (±X km)" görünür.
- **Coğrafi gerçekler.** Kıyıya uzaklık (`seaside`, Overture su poligonlarından), Open-Meteo canlı hava.
- **Ortam etiketleri.** Kategori ipuçları + DeepSeek toplu etiketleme (şehir merkezlerinde 3 km; ~10.000 mekan). "Mekan değil" kayıtları kapatıldı.
- **Yorum zekâsı katmanı (Nihat).** Tripadvisor Content API ile eşleştirme, yorumların DeepSeek ile yapılandırılmış kanıta dönüşmesi (`venue_intelligence`), sıralamaya kontrollü ek sinyal; `VENUE_INTELLIGENCE_ENABLED` ile açılıp kapanır. Pilot doğrulandı (Nergiz), tam çalıştırma yorum kaynağı kararına bağlı.
- **Arayüz.** Ana sayfa araması (3 sonuç, konum, dürüst not, fiyat seviyesi), keşfet (sunucu tarafı filtreler, gerçek istatistikler), mekan detayı ve yorum yazma, "How it works" gerçek demo. Tasarım değişmedi; sadece veri kaynağı.
- **Ölçüm.** Her arama ve tıklama `query_logs`'a yazılır (ayrıştırıcı, niyet, konum, doğruluk, sonuç bileşenleri); niyet test seti `scripts/eval/`.

## 1b. 12 Eylül'de ne değişti ve neden (Nihat için özet)

Ali'nin Azerice test cümlesi ("sevgilimle 1. yıl dönümü, tatlılar, Azerbaycan milli mutfağı, kabinet, orta segment") üzerinden dört sorun bulundu ve hepsine cümleye özel değil genel çözüm yazıldı:

| Görülen                                                                                                             | Kök neden                                                                                       | Genel çözüm                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Canlıda sonuçlar "aptal": bütçe boş, tek satır açıklama                                                             | Vercel'de DeepSeek anahtarı yok, her cümle kural çözümleyicisinde (`query_logs.parser = rules`) | Anahtarı Vercel'e girmek (bölüm 2, madde 0). Arayüzde "Basic understanding mode" notu, `parser_error` telemetrisi              |
| "Kabinet" isteği sessizce yutuluyor ya da yanlış eşleniyordu (LLM `indoor` etiketine çevirmiş, herkes ceza yemişti) | Verisi olmayan istekler için mekanizma yoktu                                                    | Kapsama raporu: kontrol edilemeyen istek puanlanmaz, kullanıcıya söylenir; LLM istemine "yaklaştırma, `unmapped`'e yaz" kuralı |
| Havalimanı tarafından arayınca "Aden restaurant" birinci                                                            | Herkes uzak olunca mesafe puanı 0'a çakılıyor, sıralamayı fiyat tahmini belirliyordu            | Mesafe artık karar vermez (ağırlık 0.4, yumuşak azalma); uzaksa şehir merkezi havuzu da aday                                   |
| Yıl dönümü için "Sahil Bar & Restaurant", "Nargile Çay Evi"                                                         | Amaç yalnızca ortam etiketine bakıyordu, mekan türüne bakmıyordu                                | Amaç–mekan tipi kuralı: bar/fast food/düğün salonu randevu ve iş için elenir                                                   |
| Bakü'de Şirvanşah Muzey, Qaynana gibi milli mutfak yerleri çıkmıyordu                                               | Açık veride "azerbaijani" etiketi nadir (3.263 restoranın 88'i), çoğu "local/home_cooking"      | Şehrin kendi mutfağı için bu etiketler kanıt; ad/etiket çelişkisi varsa değil                                                  |

Aynı cümle Bakü merkezinde şimdi: Sumakh, Мимино, Dolma Restaurant; kartın üstünde "Not in our data yet, so not checked: kabinet". Yerelde arayüzden doğrulandı, migration 0015–0016 Supabase'e uygulandı.

## 2. Kalanlar (sırayla)

> **Yön değişikliği (14 Eylül, onaylandı):** 87k açık veri siliniyor; yerine Bakü'de 250–300 iyi bilinen mekanlık kapalı şemalı katalog. Plan ve adımlar: [`docs/MEETAP-PILOT-CATALOG-PLAN.md`](docs/MEETAP-PILOT-CATALOG-PLAN.md). Şema (migration 0021), taksonomi (`src/lib/catalog/taxonomy.ts`) ve betikler (`scripts/catalog/`) hazır. Sıradaki işler artık o dokümanın 6. bölümündeki tablodur; aşağıdaki liste eski akışın kalanlarıdır ve katalog bitince gözden geçirilecek.
>
> Eski veri silindi, Vercel'de DeepSeek çalışıyor (14 Eylül, doğrulandı). Veri toplama yalnızca Apify Google Maps Scraper ile (`scripts/catalog/apify-places.mjs`); gereken tek anahtar `.env` → `APIFY_TOKEN` (ücretsiz plan, kartsız). Google Places / Tripadvisor betikleri alternatif olarak duruyor.

0. ✅ Vercel'de LLM anahtarı — Nihat ekledi, 14 Eylül'de canlı yanıtta `parser: llm` doğrulandı.
1. **Yorum verisi kaynağı kararı** — Tripadvisor resmi API tek başına mı, API + sınırlı scraper mı. Anahtar `.env` → `TRIPADVISOR_API_KEY`; betik hazır: `scripts/enrich/tripadvisor.mjs`, profil üretimi `scripts/enrich/profile-llm.mjs`. Yorum verisi olmadan motor "doğru tür mekan"ı bulur ama "iyi mekan"ı ayırt edemez.
2. **Profil üretimini tüm eşleşen mekanlara yaymak** ve sıralamada "yorumlara göre …" cümlelerini görmek; 30 cümlelik sıralama testi (Ali puanlar).
3. **Kalan ~77.000 mekanın ortam etiketlemesi** (~3,5 $ DeepSeek; onay bekliyor). Etiketsiz mekan amaç puanında nötr (0.4) kalıyor.
4. **Çalışma saatleri** ("şu an açık mı") — veri sadece %2-10 mekanda var; kullanıcı bildirimi + Tripadvisor saatleriyle tamamlanacak.
5. **Kategori temizliği** — düğün salonu, kantin gibi kayıtlar (mekan tipi kuralı ilk adım; LLM "mekan değil" bayrağı ikinci).
6. **Harita ve rota** (Etap 3): MapLibre + OpenFreeMap, OpenRouteService.
7. **Hesap ve History** (Etap 4): Supabase Auth, kaydedilenler, ziyaretler, kullanıcı puanları; sonrasında grup sohbeti (öneriler paylaşılır, mesafeye grup karar verir).
8. **Bakü şehir kartı için fotoğraf**; Londra/NY/Barselona/Paris kartları "Coming soon".
9. Mesafe kartını araç/toplu taşıma süresiyle göstermek (açıklamada "arabayla ~X dk" var; kart hâlâ yürüme dakikası). Azerice açıklama dili (şu an Türkçe şablonlar). Semt adlarını ("Kadıköy'e yakın") konum kısıtına çevirmek (bugün "not checked" listesine düşüyor).

## 3. Gelecek (yatırım sonrası)

- Google Places resmi API ile puan, fotoğraf ve saat tamamlama.
- Toplu taşıma rotası; daha güçlü LLM.
- Çiftler & arkadaşlar modu (orta nokta), avatarlar, fırsatlar, etkinlik planlama.
- Kişiselleştirme: `query_logs` tıklama verisinden ağırlık ayarı.

## 4. Kurulum

```bash
npm install
cp .env.example .env        # anahtarları ekipten al; asla commit etme
node --env-file=.env scripts/db/apply-migrations.mjs   # idempotent
npm run dev                  # http://localhost:8080
```

`SUPABASE_DB_URL` **session pooler** adresi olmalı (direct adres IPv6-only). Vite yapılandırması `@lovable.dev/vite-tanstack-config` paketiyle geliyor: TanStack Start, React, Tailwind ve Nitro/Vercel derlemesini tek pakette toplayan bir preset; kendi Vite config'imizle değiştirmek backlog'da, deploy riski yüzünden şimdilik duruyor. Ürünle veya tasarımla ilgisi yok.

## 5. Komutlar

| Amaç                                  | Komut                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Niyet çözümleyici testi               | `node scripts/eval/intent-eval.mjs` (`--llm` ile DeepSeek de)                                                      |
| Canlı öneri denemesi                  | `node --env-file=.env scripts/recommend-live.mjs Baku "cümle"`                                                     |
| Ayrıntılı hata ayıklama               | `node --env-file=.env scripts/recommend-debug.mjs Istanbul "cümle" [lat] [lon]`                                    |
| Kural/LLM karşılaştırma               | `node --env-file=.env scripts/intent-smoke.mjs "cümle"`                                                            |
| OSM verisi (Overpass, küçük alan)     | `node scripts/data/fetch-osm.mjs <alan> S W N E`                                                                   |
| OSM verisi (Geofabrik pbf, tüm şehir) | `python3 scripts/data/fetch-osm-pbf.py <alan> <pbf> S W N E`                                                       |
| Overture mekanları                    | `python3 scripts/data/fetch-overture.py <alan> W S E N` → `node scripts/data/normalize-overture.mjs`               |
| Birleştirme                           | `node scripts/data/merge-venues.mjs <alan> osm.json overture.json`                                                 |
| Supabase'e yükleme                    | `node --env-file=.env scripts/db/load-venues.mjs data/venues-<alan>.json <City> <TRY/AZN>`                         |
| Kıyı verisi                           | `python3 scripts/data/fetch-water.py <City> W S E N` → `node --env-file=.env scripts/data/load-water.mjs <City> …` |
| Ortam etiketleme (DeepSeek)           | `node --env-file=.env scripts/tag/ambiance-llm.mjs --city Istanbul --radius-km 3 --limit 500 [--dry-run]`          |
| Tripadvisor eşleştirme + yorum        | `node --env-file=.env scripts/enrich/tripadvisor.mjs --city Baku --radius-km 3 --limit 300 [--dry-run]`            |
| Yorum → profil                        | `node --env-file=.env scripts/enrich/profile-llm.mjs …`                                                            |

Şehir bbox'ları `data/README.md` içinde. Python betikleri için: `pip3 install --user overturemaps osmium`.

## 6. Dosya haritası

- `src/lib/recommend/` — motor: `intent.ts` (şema/sözlük), `rule-parser.ts`, `llm-parser.ts`, `scoring.ts` (ağırlıklar), `engine.ts` (uçtan uca akış), `venue-intelligence.ts` / `venue-evidence.ts` (yorum kanıtı)
- `src/lib/venues/server.ts` — TanStack sunucu fonksiyonları; UI'nin tek veri kapısı
- `src/hooks/use-user-position.ts` — konum izni
- `src/routes/*` — sayfalar (tasarıma dokunma; sadece veri bağlantıları değişir)
- `supabase/migrations/` — şema, sırayla uygulanır (`_migrations` tablosu takip eder)
- `scripts/` — veri boru hattı, yükleyiciler, etiketleme, zenginleştirme, değerlendirme
- `docs/MEETAP-TASKS.md` — etap etap görev listesi ve çalışma günlüğü (Notion'a import edilebilir)

## 7. Kurallar

- Onaylı tasarımı (stil, düzen, JSX) değiştirme; veri kaynağı ve mantık `src/lib/*` içinde kalsın.
- Sahte mekan/yorum ekleme. Her kayıt gerçek bir kaynağa bağlı.
- `.env` asla commit edilmez; anahtarlar sohbete yapıştırılmaz.
- Ücretli servis kullanmadan önce ücretsiz alternatif kontrol edilir.
- Git geçmişini yeniden yazma (force-push yok).
