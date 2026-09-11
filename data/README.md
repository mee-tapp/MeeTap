# Meetap veri klasörü

- `raw/` (git dışı): ham OSM / Overture indirmeleri
- `venues-<alan>.sample.json`: birleştirilmiş örnek çıktı (gerçek mekanlar, Kadıköy pilot bbox)

Üretim akışı (bbox sırası: OSM için güney batı kuzey doğu, Overture için batı güney doğu kuzey):

```bash
node scripts/data/fetch-osm.mjs kadikoy 40.975 29.015 41.005 29.060
python3 scripts/data/fetch-overture.py kadikoy 29.015 40.975 29.060 41.005   # west south east north
node scripts/data/normalize-overture.mjs kadikoy data/raw/overture-kadikoy.geojson
node scripts/data/merge-venues.mjs kadikoy data/raw/osm-kadikoy.json data/raw/overture-kadikoy.json
node scripts/recommend-smoke.mjs data/venues-kadikoy.json "Sevgilimle sakin bir yerde kebap yemek istiyorum"
```

Şehir bbox'ları:

| Şehir           | OSM (S W N E)           | Overture (W S E N)      |
| --------------- | ----------------------- | ----------------------- |
| İstanbul tamamı | 40.80 27.95 41.35 29.95 | 27.95 40.80 29.95 41.35 |
| Bakü tamamı     | 40.30 49.70 40.50 50.05 | 49.70 40.30 50.05 40.50 |
