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

# Geliştirici Rehberi (Türkçe) — Nerede kaldık, nasıl devam edilir

> Bu bölüm 12 Eylül 2026 itibarıyla projenin gerçek durumunu anlatır. Yukarıdaki İngilizce metin ürün vizyonudur; aşağıdaki teknik gerçektir.

## 1. Şu an çalışan şeyler

- **Gerçek mekan verisi:** İstanbul'un tamamı (80.431) ve Bakü'nün tamamı (7.234) Supabase'de. Kaynaklar: OpenStreetMap + Overture Maps (ikisi de açık veri, ücretsiz). Sahte mekan yok.
- **Doğal dil → niyet:** Kullanıcının cümlesini DeepSeek yapılandırılmış JSON'a çevirir (`src/lib/recommend/llm-parser.ts`); DeepSeek yoksa/çökerse kural tabanlı Türkçe/İngilizce çözümleyici devreye girer (`rule-parser.ts`). 20 cümlelik test setinde kurallar 20/20, DeepSeek 19/20 (`node scripts/eval/intent-eval.mjs`).
- **Sıralama:** Deterministik, ağırlıklı puanlama (`scoring.ts`): mutfak, ortam etiketleri, bütçe, mesafe, amaç, hava, kalite. LLM mekan seçmez; sadece cümleyi anlar. Açıklamalar puan bileşenlerinden şablonla üretilir ("serves seafood · fits your budget (estimated) · 9 min walk").
- **Coğrafi gerçekler:** Her mekanın kıyıya uzaklığı hesaplı (`seaside`), hava durumu Open-Meteo'dan canlı.
- **Ortam etiketleri:** Kategori ipuçları + DeepSeek ile toplu etiketleme. Sadece iki şehrin merkez 3 km'si etiketlendi (İstanbul 7.319, Bakü 2.708 mekan). Kalan ~77.000 mekan etiketsiz (maliyet ~3,5 $, onay bekliyor).
- **Arayüz gerçek veriye bağlı:** Ana sayfa araması (3 sonuç), keşfet sayfası, mekan detayı, yorum yazma, gerçek istatistikler, "How it works" demosu. Lovable tasarımı değiştirilmedi; sadece veri kaynağı değişti (`src/lib/venues/server.ts` tek köprü).
- **Ölçüm:** Her arama `query_logs` tablosuna yazılır (cümle, niyet, sonuçlar, tıklanan mekan).

## 2. Bilinen zayıflık ve açık karar (BURADA KALDIK)

**Sorun:** Mekanlar hakkında insan yorumu yok. Bu yüzden "romantik", "kebabı iyi", "servis yavaş" gibi atmosfer ve kalite yargıları tahminden ibaret (isim + kategori). Sistem mutfak/bütçe/mesafe/coğrafya için iyi, "gerçekten iyi mi" sorusu için zayıf.

**Karar bekleyen seçenekler (Ali):**

1. **Sadece Tripadvisor resmi Content API** — ayda 5.000 çağrı ücretsiz, kayıtta kredi kartı + günlük bütçe limiti ister. Mekan başı ~3 çağrı → ayda ~1.600 mekan. Betik hazır: `scripts/enrich/tripadvisor.mjs` (anahtar: `.env` → `TRIPADVISOR_API_KEY`).
2. **API + açık kaynak scraper** (önerilen): API eşleştirme ve puan için; en popüler 200-300 mekan için `github.com/algo7/TripAdvisor-Review-Scraper` ile 20-30 yorum. Proxy/CAPTCHA aşma yok; engellenirse durulur.
3. Sadece scraper: mekan sayfalarını bulmak için Tripadvisor aramasını taramak gerekir, sağlam değil.

Anahtar gelince yapılacaklar (sırayla): yorumları çek → DeepSeek ile mekan profili yaz (`venues.profile`, `good_for[]`; tablolar hazır: `venue_external`, `venue_reviews_external`) → sıralama profil/`good_for` kullansın, açıklama "yorumlara göre …" desin → 30 cümlelik sıralama testi (Ali puanlar).

## 3. Kurulum (yeni geliştirici)

```bash
npm install
cp .env.example .env        # Supabase, DeepSeek anahtarlarını Ali'den al; asla commit etme
node --env-file=.env scripts/db/apply-migrations.mjs   # şema zaten kurulu; idempotent
npm run dev                  # http://localhost:8080
```

Supabase bağlantısı `SUPABASE_DB_URL` **session pooler** adresi olmalı (direct adres IPv6-only, çoğu ağda çalışmaz).

## 4. Komutlar

| Amaç                                  | Komut                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Niyet çözümleyici testi               | `node scripts/eval/intent-eval.mjs` (`--llm` ile DeepSeek de)                                                      |
| Canlı öneri denemesi                  | `node --env-file=.env scripts/recommend-live.mjs Baku "cümle"`                                                     |
| Kural/LLM karşılaştırma               | `node --env-file=.env scripts/intent-smoke.mjs "cümle"`                                                            |
| OSM verisi (Overpass, küçük alan)     | `node scripts/data/fetch-osm.mjs <alan> S W N E`                                                                   |
| OSM verisi (Geofabrik pbf, tüm şehir) | `python3 scripts/data/fetch-osm-pbf.py <alan> <pbf> S W N E`                                                       |
| Overture mekanları                    | `python3 scripts/data/fetch-overture.py <alan> W S E N` → `node scripts/data/normalize-overture.mjs`               |
| Birleştirme                           | `node scripts/data/merge-venues.mjs <alan> osm.json overture.json`                                                 |
| Supabase'e yükleme                    | `node --env-file=.env scripts/db/load-venues.mjs data/venues-<alan>.json <City> <TRY/AZN>`                         |
| Kıyı verisi                           | `python3 scripts/data/fetch-water.py <City> W S E N` → `node --env-file=.env scripts/data/load-water.mjs <City> …` |
| Ortam etiketleme (DeepSeek)           | `node --env-file=.env scripts/tag/ambiance-llm.mjs --city Istanbul --radius-km 3 --limit 500 [--dry-run]`          |
| Tripadvisor yorumları                 | `node --env-file=.env scripts/enrich/tripadvisor.mjs --city Baku --radius-km 3 --limit 300 [--dry-run]`            |

Şehir bbox'ları `data/README.md` içinde. Python betikleri için: `pip3 install --user overturemaps osmium`.

## 5. Dosya haritası

- `src/lib/recommend/` — motor: `intent.ts` (şema/sözlük), `rule-parser.ts`, `llm-parser.ts`, `scoring.ts` (ağırlıklar burada), `engine.ts` (uçtan uca akış)
- `src/lib/venues/server.ts` — TanStack sunucu fonksiyonları; UI'nin tek veri kapısı
- `src/lib/weather.ts` — Open-Meteo
- `src/routes/*` — Lovable sayfaları (tasarıma dokunma; sadece veri bağlantıları değişti)
- `supabase/migrations/` — şema, sırayla uygulanır (`_migrations` tablosu takip eder)
- `scripts/` — veri boru hattı, yükleyiciler, etiketleme, değerlendirme
- `docs/MEETAP-TASKS.md` — etap etap görev listesi ve çalışma günlüğü (Notion'a import edilebilir)

## 6. Kurallar

- Lovable arayüzünü (stil, düzen, JSX) değiştirme; veri kaynağı ve mantık `src/lib/*` içinde kalsın.
- Sahte mekan/yorum ekleme. Her kayıt gerçek bir kaynağa bağlı.
- `.env` asla commit edilmez; anahtarlar sohbete yapıştırılmaz.
- Ücretli servis kullanmadan önce ücretsiz alternatif kontrol edilir (DeepSeek çok ucuz: etiketleme ~4 sent / 1.000 mekan).
- Git geçmişini yeniden yazma (Lovable senkronu bozulur).
