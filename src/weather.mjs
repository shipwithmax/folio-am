import { usesSource } from "../public/modules.mjs";
import { normalizeFeed, localClock } from "../public/core.mjs";
const conditions = {
  0: "Clear skies",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorms",
  96: "Thunderstorms with hail",
  99: "Thunderstorms with hail",
};
export async function weatherFeed(
  env,
  config,
  now = new Date(),
  fetcher = fetch,
) {
  if (!usesSource(config, "weather", "Open-Meteo")) return {};
  const failed = () => ({
    "Open-Meteo": { error: true, updatedAt: now.toISOString(), items: [] },
  });
  if (config.weatherLatitude === "" || config.weatherLongitude === "")
    return failed();
  if (config.weatherPlan === "commercial" && !env.WEATHER_API_KEY)
    return failed();
  try {
    const endpoint =
      config.weatherPlan === "commercial"
        ? "https://customer-api.open-meteo.com/v1/forecast"
        : "https://api.open-meteo.com/v1/forecast";
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      latitude: config.weatherLatitude,
      longitude: config.weatherLongitude,
      timezone: config.timezone,
      temperature_unit: config.weatherUnits,
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      forecast_days: "2",
    });
    if (config.weatherPlan === "commercial")
      url.searchParams.set("apikey", env.WEATHER_API_KEY);
    const r = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return failed();
    const d = (await r.json()).daily;
    const date = localClock(now, config.timezone).date;
    const i = d?.time?.indexOf(date) ?? -1;
    if (i < 0) return failed();
    const high = d.temperature_2m_max?.[i],
      low = d.temperature_2m_min?.[i],
      rain = d.precipitation_probability_max?.[i],
      code = d.weather_code?.[i];
    if (
      ![high, low, rain, code].every(Number.isFinite) ||
      rain < 0 ||
      rain > 100
    )
      return failed();
    const unit = config.weatherUnits === "fahrenheit" ? "°F" : "°C";
    return {
      "Open-Meteo": normalizeFeed(
        {
          items: [
            {
              id: date,
              kind: "weather",
              title: `${conditions[code] || "Daily forecast"} · ${Math.round(high)}${unit}`,
              detail: `Low ${Math.round(low)}${unit} · Rain chance ${Math.round(rain)}%. Forecast for ${date}; retrieved ${now.toISOString()}.`,
              source: "Open-Meteo · CC BY 4.0",
              url: "https://open-meteo.com/",
            },
          ],
        },
        now,
      ),
    };
  } catch {
    return failed();
  }
}
