Meetap
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
