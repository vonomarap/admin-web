export type KanevskyPlaceType = "town" | "village" | "hamlet";

export type KanevskyPlace = {
  id: string;
  name: string;
  type: KanevskyPlaceType;
  lat: number;
  lon: number;
};

export const kanevskyPlaces: readonly KanevskyPlace[] = [
  { id: "n1324570369", name: "Албаши", type: "village", lat: 46.2559082, lon: 38.6181139 },
  { id: "n356773102", name: "Александровская", type: "village", lat: 46.213718, lon: 39.064148 },
  { id: "n1270914452", name: "Большие Челбасы", type: "village", lat: 46.1024439, lon: 39.1657425 },
  { id: "n1270921316", name: "Борец Труда", type: "hamlet", lat: 46.225964, lon: 38.839199 },
  { id: "n1270925025", name: "Бурсаки", type: "hamlet", lat: 46.1042546, lon: 39.1064552 },
  { id: "n616578881", name: "Весёлый", type: "hamlet", lat: 45.9662419, lon: 39.48925 },
  { id: "n1263088840", name: "Вольный", type: "hamlet", lat: 46.2057, lon: 38.736099 },
  { id: "n1263109464", name: "Восточный", type: "hamlet", lat: 46.3325301, lon: 38.8657359 },
  { id: "n1270929209", name: "Добровольный", type: "hamlet", lat: 46.0215795, lon: 38.7240054 },
  { id: "n928995180", name: "Калинино", type: "hamlet", lat: 45.9729303, lon: 39.2198767 },
  { id: "n296886274", name: "Каневская", type: "town", lat: 46.0845999, lon: 38.9721929 },
  { id: "n1301888177", name: "Красногвардеец", type: "village", lat: 46.158024, lon: 39.1671348 },
  { id: "n2392390878", name: "Красный Очаг", type: "hamlet", lat: 46.341286, lon: 38.830997 },
  { id: "n928995181", name: "Кубанская Степь", type: "village", lat: 45.9659039, lon: 39.2271241 },
  { id: "n1271882053", name: "Ленинский", type: "hamlet", lat: 46.188808, lon: 38.697277 },
  { id: "n1270933598", name: "Мигуты", type: "village", lat: 46.1545791, lon: 39.127501 },
  { id: "n356773064", name: "Новодеревянковская", type: "village", lat: 46.3265322, lon: 38.7502463 },
  { id: "n356773076", name: "Новоминская", type: "town", lat: 46.317478, lon: 38.955532 },
  { id: "n1270936532", name: "Орджоникидзе", type: "village", lat: 46.1267996, lon: 38.7780744 },
  { id: "n1270941562", name: "Партизанский", type: "village", lat: 45.9314727, lon: 39.0351599 },
  { id: "n356773260", name: "Привольная", type: "village", lat: 46.137077, lon: 38.695133 },
  { id: "n356773370", name: "Придорожная", type: "village", lat: 45.9934921, lon: 38.9673806 },
  { id: "n1270942770", name: "Приютный", type: "hamlet", lat: 46.1996439, lon: 38.7162364 },
  { id: "n1326234150", name: "Раздольный", type: "hamlet", lat: 46.294753, lon: 38.6184544 },
  { id: "n1271817700", name: "Сладкий Лиман", type: "village", lat: 46.183201, lon: 38.797298 },
  { id: "n1270913111", name: "Средние Челбасы", type: "village", lat: 46.0548988, lon: 39.1584253 },
  { id: "n296886275", name: "Стародеревянковская", type: "town", lat: 46.1277738, lon: 38.9713729 },
  { id: "n1270830180", name: "Степной", type: "village", lat: 45.9434853, lon: 39.1572898 },
  { id: "n929000855", name: "Сухие Челбасы", type: "village", lat: 45.9764044, lon: 39.1599245 },
  { id: "n367985853", name: "Труд", type: "village", lat: 46.1553659, lon: 38.5373704 },
  { id: "n1270954190", name: "Трудовая Армения", type: "hamlet", lat: 46.17741, lon: 38.837624 },
  { id: "n1270956445", name: "Ударный", type: "village", lat: 46.20218, lon: 39.0083829 },
  { id: "n1270964402", name: "Украинка", type: "hamlet", lat: 46.1149684, lon: 39.1534258 },
  { id: "n1923524949", name: "Чапаев", type: "hamlet", lat: 46.334309, lon: 38.991184 },
  { id: "n356773302", name: "Челбасская", type: "village", lat: 45.9784556, lon: 39.3753366 },
  { id: "n910412580", name: "Черкасский", type: "hamlet", lat: 46.1395045, lon: 38.9116797 },
  { id: "n1271936602", name: "Шевченко", type: "hamlet", lat: 46.1132774, lon: 39.1327316 },
];
