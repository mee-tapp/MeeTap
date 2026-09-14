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

> 14 Eylül 2026 gecesi itibarıyla gerçek durum. Yukarıdaki İngilizce metin ürün vizyonu; aşağısı teknik gerçek. Görev listesi ve günlük: `docs/MEETAP-TASKS.md`. Katalog planı: `docs/MEETAP-PILOT-CATALOG-PLAN.md`.

## 1. Şu an ne var

**Yön (14 Eylül):** 87.000 açık veri kaydı silindi. Yerine Bakü'de az ama tam bilinen mekanlardan oluşan **pilot katalog** var; öneri motoru yalnızca bu katalogla cevap verir (`venues.catalog_tier = 'pilot'`). Amaç, "LLM'li öneri sistemimiz iyi mi?" sorusunu ölçebilmek.

**Katalog (Supabase):**

|                             |                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mekan                       | 261 (129 restoran, 60 kafe, 27 bar, 25 tatlıcı, 10 lounge, 7 quick bites, 3 çay evi)                                                       |
| Yorum metni                 | 2.162 (Azerice 1.287, İngilizce 759, Rusça 51), mekan başına ~8                                                                            |
| Google puanı + yorum sayısı | hepsinde (toplam 144.761 yorum, ortalama 4.49)                                                                                             |
| Olanaklar                   | 247 mekanda 3+ özellik; kabinet (`private_room`) 50 mekanda; fiyat aralığı 185 mekanda                                                     |
| Şema                        | `src/lib/catalog/taxonomy.ts`: 7 tür, 37 mutfak, 5 öğün, 9 amaç, 38 özellik (kapalı listeler) + Google İngilizce/Azerice etiket eşlemeleri |

**Veri nereden geldi:** Apify Google Maps Scraper ile 771 aday (ücretsiz kredinin 3,95 $'ı), otomatik seçimle 181 mekan; yerel, açık kaynak `gosom/google-maps-scraper` ile bu mekanların ve 91 kafe/tatlıcının detayı ve yorumları (sıfır maliyet). Google 300 yorumluk derin çekimi engelliyor (403); aşan bir şey yazılmıyor. Ham çıktılar `data/catalog/gosom/` (git dışı), aday listesi `data/catalog/baku-candidates.json`, seçim `data/catalog/baku-pilot.csv`.

**Cümleyi anlama:** DeepSeek serbest metni kapalı şemaya çevirir: amaç, mutfak, ortam, bütçe, kişi sayısı, **özellikler** (kabinet → `private_room`, karaoke, canlı müzik, nargile, teras, helal…), **öğün**, **yemek adı** (`dish`: "xəngəl", "cheesecake"), eşlenemeyen istekler (`unmapped`). DeepSeek yoksa kural tabanlı TR/AZ/EN çözümleyici; arayüzde "Basic understanding mode" notu ve `query_logs.parser_error`. Test seti 25 cümle: kurallar 25/25, DeepSeek 25/25.

**Sıralama (deterministik, LLM mekan seçmez):**

- Mutfak zorunluluk (2.5); birden fazla mutfakta ilk yazılan ana mutfak. Şehrin kendi mutfağı için "local/home_cooking" etiketleri de kanıt.
- Özellik zorunluluk (2.0): katalogda o özelliğe sahip mekan varsa yalnızca onlar; hiçbirinde veri yoksa "Not in our data yet, so not checked: …" satırı (kapsama raporu).
- Yemek adı (2.0): gerçek yorum metinlerinde geçen mekanlar öne geçer ("yorumlarda 'xəngəl' geçiyor (3)").
- Amaç (1.6): Google'ın "randevu/aile/grup için iyi" verisi doğrudan kanıt; mekan tipi kuralı: bar/pub/nargile, fast food, düğün salonu randevu ve iş yemeği için aday olamaz (açıkça bar istenmediyse).
- Kalite (1.4): Google puanı, yorum sayısına göre Bayes düzeltmeli ("Google 4.7 (5.4k yorum)").
- Ortam 1.5, bütçe 1.3, hava 0.8, öğün 0.6, ihtiyaçlar 0.6, **mesafe 0.4** (gösterilir, karar vermez; uzaksa "uzak (arabayla ~X dk)").
- Açıklama ifadesi kanıta göre: "iyi" = veri, "uygun görünüyor" = tahmin.

**Konum:** arama kutusuna odaklanınca izin istenir; 3 km'den kaba konum yok sayılır, şehir merkezi kullanılır; doğruluk kaydedilir ("From you (±X km)").

**Arayüz (Nihat):** ana sayfa araması, keşfet, mekan detayı ve yorum, giriş/hesap sayfası, işletme paneli (`business-dashboard`), fotoğraf ve menü alanları. Tasarım Lovable'dan; değişmez.

**Ölçüm:** her arama `query_logs`'a (ayrıştırıcı, niyet, konum, doğruluk, sonuç bileşenleri, tıklama).

## 2. Sıradaki adımlar (sırayla)

1. **Altın set (Ali).** 40 gerçek cümle (Azerice/Türkçe/İngilizce) ve her biri için "doğru" saydığı 3–5 katalog mekanı. Claude `scripts/eval/ranking-eval.mjs` ile hit@3 ölçer, ağırlıkları buna göre ayarlar. Hedef ≥ %80.
2. **LLM profil (Claude).** Mevcut 8 yorum + olanaklardan mekan başına: imza yemekler (`signature_dishes`), güçlü/zayıf yönler, 2 cümle özet (`scripts/enrich/profile-llm.mjs` genişletilecek; ~0,5 $ DeepSeek). Açıklamalar "yorumlara göre …" diyebilecek.
3. **Elle kalite turu (Ali, 2 saat).** 261 mekanın tür/mutfak/kabinet bilgisini gözden geçirme; düzeltmeler `catalog_notes` ile korunur.
4. **Yorum derinliği.** 1 Ekim'de Apify kredisi yenilenince `scripts/catalog/apify-reviews.mjs --max-reviews 25` (≈ 6.500 yorum, 4 $). Tripadvisor ikinci puan/özellik: anahtar gelince `scripts/enrich/tripadvisor.mjs` + `merge-external.mjs`.
5. **Katalog büyütme.** Aynı tarifle Bakü 500 (eksik türler: çay evi, quick bites), sonra İstanbul 300 (Kadıköy + Beyoğlu).
6. **Arayüz küçük işler:** mesafe kartında araba süresi, mekan detayında Google puanı ve yorum sayısı, Azerice açıklama dili.
7. **Ürün:** hesap/geçmiş üstüne grup sohbeti (öneriler paylaşılır, mesafeye grup karar verir); harita ve rota.

## 3. Yatırım sonrası (ücretli)

- Google Places API (resmi) ile puan, saat, fotoğraf ve yorum tazeleme; Apify/scraper bırakılır.
- Wolt / Yandex Eats menü verisi anlaşmayla; sosyal medya yalnızca resmi API ile.
- Daha güçlü LLM, toplu taşıma rotası, kişiselleştirme (`query_logs` tıklamalarından ağırlık öğrenme).

## 4. Kurulum

```bash
npm install
cp .env.example .env        # anahtarları ekipten al; asla commit etme
node --env-file=.env scripts/db/apply-migrations.mjs   # idempotent, 0001–0022
npm run dev                  # http://localhost:8080
```

`SUPABASE_DB_URL` **session pooler** adresi olmalı (direct adres IPv6-only). Gerekli anahtarlar: Supabase (3), `LLM_PROVIDER=deepseek` + `DEEPSEEK_API_KEY`, **yedek LLM** `GROQ_API_KEY` (console.groq.com, ücretsiz, kartsız; DeepSeek yanıt vermezse sırayla denenir, 15 Eylül'de DeepSeek saatlerce cevap vermedi), veri toplama için `APIFY_TOKEN`. Vercel'de aynı anahtarlar tanımlı (Nihat, 14 Eylül). Vite yapılandırması `@lovable.dev/vite-tanstack-config` preset'iyle gelir; deploy riski yüzünden değiştirilmedi, ürünle ilgisi yok.

Yerel scraper için bir kez: `brew install go && go install github.com/gosom/google-maps-scraper@latest` (ikili `~/go/bin/`; ilk çalıştırmada Chromium indirir).

## 5. Komutlar

| Amaç                              | Komut                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Niyet çözümleyici testi           | `node --env-file=.env scripts/eval/intent-eval.mjs --llm`                                                                                                                                    |
| Canlı öneri denemesi              | `node --env-file=.env scripts/recommend-live.mjs Baku "cümle"`                                                                                                                               |
| Ayrıntılı hata ayıklama           | `node --env-file=.env scripts/recommend-debug.mjs Baku "cümle" [lat] [lon]`                                                                                                                  |
| Aday listesi (Apify)              | `node --env-file=.env scripts/catalog/apify-places.mjs --search --city Baku [--only-outside] [--dry-run]`                                                                                    |
| Seçim önerisi (`keep` sütunu)     | `node scripts/catalog/select-pilot.mjs --city Baku`                                                                                                                                          |
| Yerel scraper (URL listesi)       | `~/go/bin/google-maps-scraper -input data/catalog/baku-pilot.scraper-input.txt -results data/catalog/gosom/out.json -json -c 1 -depth 1 -disable-page-reuse -lang en -exit-on-inactivity 3m` |
| Scraper çıktısını yükleme         | `node --env-file=.env scripts/catalog/import-gosom.mjs data/catalog/gosom/out.json --city Baku --only-keep` (kafe turu: `--min-reviews 30`)                                                  |
| Apify detay + yorum (kredi varsa) | `node --env-file=.env scripts/catalog/apify-places.mjs --details --city Baku --max-reviews 10` · `apify-reviews.mjs --max-reviews 25`                                                        |
| Tripadvisor (anahtar gelince)     | `scripts/enrich/tripadvisor.mjs --city Baku --limit 300` → `scripts/catalog/merge-external.mjs --city Baku`                                                                                  |
| Yorum → profil                    | `node --env-file=.env scripts/enrich/profile-llm.mjs --venue-id <uuid> --write`                                                                                                              |
| Kataloğu sıfırlama (yıkıcı)       | `node --env-file=.env scripts/db/reset-venues.mjs`                                                                                                                                           |

Eski açık veri boru hattı (`scripts/data/*`, `scripts/db/load-venues.mjs`, `scripts/tag/ambiance-llm.mjs`) repoda duruyor; pilot kararıyla kullanım dışı.

## 6. Dosya haritası

- `src/lib/catalog/taxonomy.ts` — kapalı şema ve etiket eşlemeleri (yeni kavram = buraya alan + veri, motora kural değil)
- `src/lib/recommend/` — `intent.ts` (şema), `rule-parser.ts`, `llm-parser.ts`, `scoring.ts` (ağırlıklar, kurallar), `engine.ts` (akış, kapsama raporu), `venue-intelligence.ts` / `venue-evidence.ts` (yorum kanıtı)
- `src/lib/venues/server.ts` — TanStack sunucu fonksiyonları; UI'nin tek veri kapısı
- `src/components/`, `src/routes/*` — sayfalar ve Nihat'ın hesap/işletme bileşenleri (tasarıma dokunma)
- `supabase/migrations/` — şema, sırayla (`_migrations` tablosu); 0021–0022 katalog kolonları ve `venues_nearby`
- `scripts/catalog/` — katalog toplama ve yükleme; `scripts/eval/` — test setleri
- `docs/MEETAP-TASKS.md` — görev listesi ve günlük (Notion'a import edilebilir); `docs/MEETAP-PILOT-CATALOG-PLAN.md` — katalog planı

## 7. Kurallar

- Onaylı tasarımı (stil, düzen, JSX) değiştirme; veri kaynağı ve mantık `src/lib/*` içinde kalsın.
- Sahte mekan/yorum ekleme. Her kayıt gerçek bir kaynağa bağlı; yorum metinleri arayüzde ham gösterilmez.
- Yeni bir kavram çıkınca motora cümleye özel kural değil, taksonomiye alan ve kataloğa veri eklenir.
- `.env` asla commit edilmez; anahtarlar sohbete yapıştırılmaz.
- Yatırım öncesi cepten para çıkmaz; bot korumasını aşan araç yazılmaz.
- Git geçmişini yeniden yazma (force-push yok).
