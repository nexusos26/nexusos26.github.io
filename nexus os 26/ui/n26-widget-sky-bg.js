/* ui/n26-widget-sky-bg.js · 戳 sky4 · 由素材目录扫描生成（勿手改）
 * 9 时段 × 16 天气状况 → 真实存在的背景文件；缺档按候选顺序回退 sunny 同档，零 404。
 * 重新生成：按 weather_quick_card_<cond>_<variant>.webp 扫 天气素材/天气/OPPO天气/天气背景/ 。
 * 9 档（用户 11-13 钦定）：日出 / 早晨 / 中午 / 下午 / 黄昏时分 / 蓝调时分 / 傍晚 / 夜晚 / 凌晨。
 */
/* 基址按「本脚本自身 URL」反推，不依赖页面/iframe 的文档基址：
   ui/ 在应用目录下一层，天气素材与应用目录同级，所以从脚本地址上溯两级。 */
(function () {
  var FALLBACK = '../天气素材/天气/OPPO天气/天气背景/';
  window.N26_SKY_BG_BASE = FALLBACK;
  try {
    var sc = document.currentScript;
    if (sc && sc.src) window.N26_SKY_BG_BASE = new URL('../../天气素材/天气/OPPO天气/天气背景/', sc.src).href;
  } catch (e) { /* 保持相对路径兜底 */ }
})();
window.N26_SKY_BG = {
  "cloudy": {
    "sunrise": "weather_quick_card_cloudy_morning_small_bg.webp",
    "morning": "weather_quick_card_cloudy_morning_2x2.webp",
    "noon": "weather_quick_card_cloudy_daytime_2x2.webp",
    "afternoon": "weather_quick_card_cloudy_daytime_2x4.webp",
    "golden": "weather_quick_card_cloudy_evening_small_bg.webp",
    "bluehour": "weather_quick_card_cloudy_small_night_bg.webp",
    "evening": "weather_quick_card_cloudy_evening_2x2.webp",
    "night": "weather_quick_card_cloudy_night_2x2.webp",
    "latenight": "weather_quick_card_cloudy_night_2x4.webp"
  },
  "drizzle": {
    "sunrise": "weather_quick_card_drizzle_daytime_2x2.webp",
    "morning": "weather_quick_card_drizzle_daytime_2x2.webp",
    "noon": "weather_quick_card_drizzle_daytime_2x2.webp",
    "afternoon": "weather_quick_card_drizzle_daytime_2x4.webp",
    "golden": "weather_quick_card_drizzle_daytime_2x2.webp",
    "bluehour": "weather_quick_card_drizzle_night_2x2.webp",
    "evening": "weather_quick_card_drizzle_night_2x2.webp",
    "night": "weather_quick_card_drizzle_night_2x2.webp",
    "latenight": "weather_quick_card_drizzle_night_2x4.webp"
  },
  "fog": {
    "sunrise": "weather_quick_card_fog_big_bg.webp",
    "morning": "weather_quick_card_fog_big_bg.webp",
    "noon": "weather_quick_card_fog_daytime_2x2.webp",
    "afternoon": "weather_quick_card_fog_daytime_2x4.webp",
    "golden": "weather_quick_card_fog_middle_bg.webp",
    "bluehour": "weather_quick_card_fog_small_night_bg.webp",
    "evening": "weather_quick_card_fog_night_2x2.webp",
    "night": "weather_quick_card_fog_night_2x2.webp",
    "latenight": "weather_quick_card_fog_night_2x4.webp"
  },
  "hailstone": {
    "sunrise": "weather_quick_card_hailstone_daytime_2x2.webp",
    "morning": "weather_quick_card_hailstone_daytime_2x2.webp",
    "noon": "weather_quick_card_hailstone_daytime_2x2.webp",
    "afternoon": "weather_quick_card_hailstone_daytime_2x4.webp",
    "golden": "weather_quick_card_hailstone_daytime_2x2.webp",
    "bluehour": "weather_quick_card_hailstone_night_2x2.webp",
    "evening": "weather_quick_card_hailstone_night_2x2.webp",
    "night": "weather_quick_card_hailstone_night_2x2.webp",
    "latenight": "weather_quick_card_hailstone_night_2x4.webp"
  },
  "haze": {
    "sunrise": "weather_quick_card_haze_daytime_2x2.webp",
    "morning": "weather_quick_card_haze_daytime_2x2.webp",
    "noon": "weather_quick_card_haze_daytime_2x2.webp",
    "afternoon": "weather_quick_card_haze_daytime_2x4.webp",
    "golden": "weather_quick_card_haze_daytime_2x2.webp",
    "bluehour": "weather_quick_card_haze_night_2x2.webp",
    "evening": "weather_quick_card_haze_night_2x2.webp",
    "night": "weather_quick_card_haze_night_2x2.webp",
    "latenight": "weather_quick_card_haze_night_2x4.webp"
  },
  "overcast": {
    "sunrise": "weather_quick_card_overcast_big_bg.webp",
    "morning": "weather_quick_card_overcast_big_bg.webp",
    "noon": "weather_quick_card_overcast_daytime_2x2.webp",
    "afternoon": "weather_quick_card_overcast_daytime_2x4.webp",
    "golden": "weather_quick_card_overcast_middle_bg.webp",
    "bluehour": "weather_quick_card_overcast_small_night_bg.webp",
    "evening": "weather_quick_card_overcast_night_2x2.webp",
    "night": "weather_quick_card_overcast_night_2x2.webp",
    "latenight": "weather_quick_card_overcast_night_2x4.webp"
  },
  "rain": {
    "sunrise": "weather_quick_card_rain_big_bg.webp",
    "morning": "weather_quick_card_rain_big_bg.webp",
    "noon": "weather_quick_card_rain_big_bg.webp",
    "afternoon": "weather_quick_card_rain_middle_bg.webp",
    "golden": "weather_quick_card_rain_middle_bg.webp",
    "bluehour": "weather_quick_card_rain_small_night_bg.webp",
    "evening": "weather_quick_card_sunny_evening_2x2.webp",
    "night": "weather_quick_card_rain_big_night_bg.webp",
    "latenight": "weather_quick_card_rain_big_night_bg.webp"
  },
  "sandstorm": {
    "sunrise": "weather_quick_card_sandstorm_daytime_2x2.webp",
    "morning": "weather_quick_card_sandstorm_daytime_2x2.webp",
    "noon": "weather_quick_card_sandstorm_daytime_2x2.webp",
    "afternoon": "weather_quick_card_sandstorm_daytime_2x4.webp",
    "golden": "weather_quick_card_sandstorm_daytime_2x2.webp",
    "bluehour": "weather_quick_card_sandstorm_night_2x2.webp",
    "evening": "weather_quick_card_sandstorm_night_2x2.webp",
    "night": "weather_quick_card_sandstorm_night_2x2.webp",
    "latenight": "weather_quick_card_sandstorm_night_2x4.webp"
  },
  "sleet": {
    "sunrise": "weather_quick_card_sleet_daytime_2x2.webp",
    "morning": "weather_quick_card_sleet_daytime_2x2.webp",
    "noon": "weather_quick_card_sleet_daytime_2x2.webp",
    "afternoon": "weather_quick_card_sleet_daytime_2x4.webp",
    "golden": "weather_quick_card_sleet_daytime_2x2.webp",
    "bluehour": "weather_quick_card_sleet_night_2x2.webp",
    "evening": "weather_quick_card_sleet_night_2x2.webp",
    "night": "weather_quick_card_sleet_night_2x2.webp",
    "latenight": "weather_quick_card_sleet_night_2x4.webp"
  },
  "snow": {
    "sunrise": "weather_quick_card_snow_big_bg.webp",
    "morning": "weather_quick_card_snow_big_bg.webp",
    "noon": "weather_quick_card_snow_daytime_2x2.webp",
    "afternoon": "weather_quick_card_snow_daytime_2x4.webp",
    "golden": "weather_quick_card_snow_middle_bg.webp",
    "bluehour": "weather_quick_card_snow_small_night_bg.webp",
    "evening": "weather_quick_card_snow_night_2x2.webp",
    "night": "weather_quick_card_snow_night_2x2.webp",
    "latenight": "weather_quick_card_snow_night_2x4.webp"
  },
  "storm": {
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sunny_daytime_2x2.webp",
    "afternoon": "weather_quick_card_sunny_daytime_2x4.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "bluehour": "weather_quick_card_sunny_small_night_bg.webp",
    "evening": "weather_quick_card_sunny_evening_2x2.webp",
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "latenight": "weather_quick_card_sunny_night_2x4.webp"
  },
  "storms": {
    "sunrise": "weather_quick_card_storms_daytime_2x2.webp",
    "morning": "weather_quick_card_storms_daytime_2x2.webp",
    "noon": "weather_quick_card_storms_daytime_2x2.webp",
    "afternoon": "weather_quick_card_storms_daytime_2x4.webp",
    "golden": "weather_quick_card_storms_daytime_2x2.webp",
    "bluehour": "weather_quick_card_storms_night_2x2.webp",
    "evening": "weather_quick_card_storms_night_2x2.webp",
    "night": "weather_quick_card_storms_night_2x2.webp",
    "latenight": "weather_quick_card_storms_night_2x4.webp"
  },
  "sunning": {
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sunny_daytime_2x2.webp",
    "afternoon": "weather_quick_card_sunny_daytime_2x4.webp",
    "golden": "weather_quick_card_sunning_evening_small_bg.webp",
    "bluehour": "weather_quick_card_sunning_evening_small_dark_bg.webp",
    "evening": "weather_quick_card_sunning_evening_middle_bg.webp",
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "latenight": "weather_quick_card_sunny_night_2x4.webp"
  },
  "sunny": {
    "sunrise": "weather_quick_card_sunny_big_bg.webp",
    "morning": "weather_quick_card_sunny_big_bg.webp",
    "noon": "weather_quick_card_sunny_daytime_2x2.webp",
    "afternoon": "weather_quick_card_sunny_daytime_2x4.webp",
    "golden": "weather_quick_card_sunny_evening_2x2.webp",
    "bluehour": "weather_quick_card_sunny_small_night_bg.webp",
    "evening": "weather_quick_card_sunny_evening_2x2.webp",
    "night": "weather_quick_card_sunny_night_2x2.webp",
    "latenight": "weather_quick_card_sunny_night_2x4.webp"
  },
  "thunder": {
    "sunrise": "weather_quick_card_thunder_big_bg.webp",
    "morning": "weather_quick_card_thunder_big_bg.webp",
    "noon": "weather_quick_card_thunder_daytime_2x2.webp",
    "afternoon": "weather_quick_card_thunder_daytime_2x4.webp",
    "golden": "weather_quick_card_thunder_middle_bg.webp",
    "bluehour": "weather_quick_card_thunder_small_night_bg.webp",
    "evening": "weather_quick_card_thunder_night_2x2.webp",
    "night": "weather_quick_card_thunder_night_2x2.webp",
    "latenight": "weather_quick_card_thunder_night_2x4.webp"
  },
  "wind": {
    "sunrise": "weather_quick_card_wind_daytime_2x2.webp",
    "morning": "weather_quick_card_wind_daytime_2x2.webp",
    "noon": "weather_quick_card_wind_daytime_2x2.webp",
    "afternoon": "weather_quick_card_wind_daytime_2x4.webp",
    "golden": "weather_quick_card_wind_daytime_2x2.webp",
    "bluehour": "weather_quick_card_wind_night_2x2.webp",
    "evening": "weather_quick_card_wind_night_2x2.webp",
    "night": "weather_quick_card_wind_night_2x2.webp",
    "latenight": "weather_quick_card_wind_night_2x4.webp"
  }
};
window.N26_SKY_FALLBACK = {
  "sunrise": "weather_quick_card_sunny_big_bg.webp",
  "morning": "weather_quick_card_sunny_big_bg.webp",
  "noon": "weather_quick_card_sunny_daytime_2x2.webp",
  "afternoon": "weather_quick_card_sunny_daytime_2x4.webp",
  "golden": "weather_quick_card_sunny_evening_2x2.webp",
  "bluehour": "weather_quick_card_sunny_small_night_bg.webp",
  "evening": "weather_quick_card_sunny_evening_2x2.webp",
  "night": "weather_quick_card_sunny_night_2x2.webp",
  "latenight": "weather_quick_card_sunny_night_2x4.webp"
};
