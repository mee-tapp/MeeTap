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
- **Cümleyi anlama.** DeepSeek serbest metni yapılandırılmış niyete çevirir; DeepSeek yoksa kural tabanlı Türkçe/İngilizce çözümleyici devreye girer ve arayüz "basic understanding mode" notu gösterir (LLM'in neden devreye girmediği `query_logs.parser_error`'a yazılır). Mutfak sözlüğü açık: "<x> mutfağı" kalıbı ve serbest anahtarlarla Özbek, Gürcü, Lübnan gibi listede olmayan mutfaklar da çalışır. 25 cümlelik test seti: kurallar 25/25, DeepSeek 24/25.
- **Sıralama.** Deterministik puanlama: mutfak (zorunluluk), ortam, bütçe, mesafe, amaç, hava, kalite, ihtiyaçlar. LLM mekan seçmez. Açıklamalar puan bileşenlerinden üretilir ve kanıta göre ifade değişir ("uygun görünüyor" = tahmin, "iyi" = insan verisi). İstenen mutfak bulunamazsa arayüz bunu söyler.
- **Kapsama raporu (dürüstlük katmanı).** Motor her aramada isteğin hangi parçalarını gerçek veriyle kontrol edebildiğini (`coverage.applied`) ve hangilerini edemediğini (`coverage.unverifiable`) döndürür: LLM'in eşleyemediği istekler ("kabinet", "tatlıları güzel olsun"), aday havuzunda hiçbir mekanda bulunmayan ortam etiketleri, verisi olmayan ihtiyaçlar (helal, tekerlekli sandalye…). Bunlar puanlamaya sokulmaz (yoksa her sonuç "ortama uymuyor" diye cezalanırdı) ve sonuç kartının üstünde "Not in our data yet, so not checked: …" satırıyla kullanıcıya söylenir. Şehrin kendi mutfağı (Bakü → Azerbaycan, İstanbul → Türk) istenince açık veride sık görülen "local / regional / home_cooking" etiketleri de kanıt sayılır ("yerel mutfak", daha düşük ağırlık), ama etiketi veya adı başka bir mutfağı söyleyen mekanlar (Gürcü Mətbəxi, Anadolu Restaurant) bu kanıttan yararlanamaz; başka şehirde bu etiketler o mutfak sayılmaz. Tarayıcı konumu 3 km'den kaba (IP tahmini) ise kullanılmaz, şehir merkezi esas alınır. Birden fazla mutfak istenirse ilk yazılan ana mutfaktır; kısmi eşleşme "Azerbaycan mutfağı var (tatlı bilgisi yok)" diye açıklanır. Konum paylaşılmış ve tüm sonuçlar 1 saatten uzak yürümedeyse "uzak (arabayla ~25 dk)" ifadesi ve ayrı bir not çıkar.
- **Coğrafi gerçekler.** Kıyıya uzaklık (`seaside`), Open-Meteo canlı hava, kullanıcı konumu (izin verilirse; yoksa şehir merkezi).
- **Ortam etiketleri.** Kategori ipuçları + DeepSeek toplu etiketleme (şehir merkezlerinde 3 km; ~10.000 mekan). "Mekan değil" kayıtları kapatıldı.
- **Yorum zekâsı katmanı (Nihat).** Tripadvisor Content API ile eşleştirme, yorumların DeepSeek ile yapılandırılmış kanıta dönüşmesi (`venue_intelligence`), sıralamaya kontrollü ek sinyal; `VENUE_INTELLIGENCE_ENABLED` ile açılıp kapanır. Pilot doğrulandı (Nergiz), tam çalıştırma yorum kaynağı kararına bağlı.
- **Arayüz.** Ana sayfa araması (3 sonuç, konum, dürüst not, fiyat seviyesi), keşfet (sunucu tarafı filtreler, gerçek istatistikler), mekan detayı ve yorum yazma, "How it works" gerçek demo. Tasarım değişmedi; sadece veri kaynağı.
- **Ölçüm.** Her arama ve tıklama `query_logs`'a yazılır; niyet test seti `scripts/eval/`.

## 2. Kalanlar (sırayla)

0. **Vercel'de LLM anahtarı yok (acil, 5 dakika).** Canlı sitede her cümle kural çözümleyicisiyle okunuyor (`query_logs.parser = rules`, 2026-09-12 doğrulandı) — DeepSeek yalnızca yerel `.env`'de tanımlı. Vercel → Project → Settings → Environment Variables'a `LLM_PROVIDER=deepseek` ve `DEEPSEEK_API_KEY` (Production + Preview) ekleyip yeniden deploy edin. Doğrulama: sitede bir arama yapın, kartın üstünde "Basic understanding mode" notu çıkmamalı; `query_logs.parser` `llm` olmalı. Aynı ekranda `VENUE_INTELLIGENCE_ENABLED`, `TRIPADVISOR_API_KEY` gibi diğer sunucu anahtarları da kontrol edilmeli.
1. **Yorum verisi kaynağı kararı** — Tripadvisor resmi API tek başına mı, API + sınırlı scraper mı. Anahtar `.env` → `TRIPADVISOR_API_KEY`; betik hazır: `scripts/enrich/tripadvisor.mjs`, profil üretimi `scripts/enrich/profile-llm.mjs`.
2. **Profil üretimini tüm eşleşen mekanlara yaymak** ve sıralamada "yorumlara göre …" cümlelerini görmek; 30 cümlelik sıralama testi (Ali puanlar).
3. **Kalan ~77.000 mekanın ortam etiketlemesi** (~3,5 $ DeepSeek; onay bekliyor).
4. **Çalışma saatleri** ("şu an açık mı") — veri sadece %2-10 mekanda var; kullanıcı bildirimi + Tripadvisor saatleriyle tamamlanacak.
5. **Kategori temizliği** — düğün salonu, kantin gibi kayıtlar (LLM "mekan değil" bayrağı ilk adım).
6. **Harita ve rota** (Etap 3): MapLibre + OpenFreeMap, OpenRouteService.
7. **Hesap ve History** (Etap 4): Supabase Auth, kaydedilenler, ziyaretler, kullanıcı puanları.
8. **Bakü şehir kartı için fotoğraf**; Londra/NY/Barselona/Paris kartları "Coming soon".
9. Uzak sonuçlarda mesafe kartını araç/toplu taşıma süresiyle göstermek (açıklama satırında "arabayla ~X dk" tahmini var; kart hâlâ yürüme dakikası). Azerice cümleler için ayrı açıklama dili (şu an Türkçe şablonlar kullanılıyor). Semt/ilçe adlarını ("Kadıköy'e yakın") konum kısıtına çevirmek — bugün "not checked" listesine düşüyor.

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
