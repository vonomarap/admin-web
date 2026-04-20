export const BASE_RATE_LABELS = {
  default: "База (default)",
  window: "Окно",
  balcony_door: "Балконная дверь",
  entrance_door: "Входная дверь",
  interior_door: "Межкомнатная дверь",
} as const;

export const PROFILE_SERIES_LABELS = {
  bautex: "Bautex",
  kbe: "KBE",
  rehau: "Rehau",
  kommerling: "Kommerling",
} as const;

export const PROFILE_MODEL_LABELS = {
  bautex_58: "Bautex 58",
  kbe_58: "KBE 58",
  kbe_expert_70: "KBE Expert 70",
  kbe_76: "KBE 76",
  rehau_blitz_new: "Rehau Blitz New",
  rehau_thermo_design: "Rehau Thermo-Design",
  rehau_grazio: "Rehau Grazio",
  rehau_delight_design: "Rehau Delight-Design",
  rehau_intelio: "Rehau Intelio",
  rehau_geneo: "Rehau Geneo",
  kommerling_70_ad: "Kommerling 70 AD",
  kommerling_76_ad: "Kommerling 76 AD",
} as const;

export const GLAZING_LABELS = {
  single: "Однокамерный",
  double: "Двухкамерный",
} as const;

export const GLASS_OPTION_LABELS = {
  energySaving: "Энергосберегающий стеклопакет",
  multiFunctional: "Мультифункциональный стеклопакет",
} as const;

export const LAMINATION_LABELS = {
  none: "Без ламинации",
  oneSide: "Ламинация (1 сторона)",
  twoSide: "Ламинация (2 стороны)",
} as const;

export const LAMINATION_GROUP_LABELS = {
  white: "Белая",
  wood: "Под дерево",
  color: "Цветная",
} as const;

export const LAMINATION_SIDE_LABELS = {
  outside: "Наружная",
  inside: "Внутренняя",
} as const;

export const DESIGN_OPTION_LABELS = {
  none: "Нет",
  outside: "Наружная",
  inside: "Внутренняя",
  twoSideWhite: "Двусторонняя на белой основе",
  twoSideColor: "Двусторонняя на цветной основе",
  twoSideWood: "Двусторонняя (под дерево)",
} as const;

export const LAMINATION_COLOR_LABELS = {
  gold_oak: "Золотой дуб",
  grey_oak: "Серый дуб",
  dark_oak: "Тёмный дуб",
  other: "Другой цвет",
} as const;

export const ENTRANCE_FILL_LABELS = {
  glass: "Стекло",
  sandwich: "Сэндвич",
} as const;

export const OPENING_TYPE_LABELS = {
  turn: "Поворотное",
  tiltTurn: "Поворотно-откидное",
} as const;

export const DOOR_SUBTYPE_LABELS = {
  balcony: "Балконная",
  entrance: "Входная",
  interior: "Межкомнатная",
} as const;

export const OPTION_LABELS = {
  mosquito_net: "Москитная сетка",
  window_sill: "Подоконник",
  drip_edge: "Отлив",
  casing: "Наличники",
  child_lock: "Детский замок",
  decor_bars: "Декоративные шпросы",
  triplex: "Триплекс",
  tinted_glass: "Тонировка",
  vent_valve: "Клапан проветривания",
  door_closer: "Доводчик",
  peephole: "Глазок",
  reinforced_hinges: "Усиленные петли",
  warm_install: "Теплый монтаж",
  trash_removal: "Вывоз мусора",
} as const;

export const KNOWN_OPTION_KEYS = Object.keys(OPTION_LABELS) as Array<keyof typeof OPTION_LABELS>;
