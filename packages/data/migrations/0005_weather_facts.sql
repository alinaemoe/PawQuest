-- Full weather facts of a walk (rain history, ground, air, pollen) as JSON next to the basic columns.
ALTER TABLE weather_snapshot ADD COLUMN facts_json TEXT;
