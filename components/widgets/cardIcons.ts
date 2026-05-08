const ION_BASE = 'https://unpkg.com/ionicons@7.1.0/dist/svg';

type CardIconConfig = {
  file: string;
  label: string;
};

const ICON_CONFIG: Record<string, CardIconConfig> = {
  bag: { file: 'bag-handle-outline', label: 'Pedidos' },
  analytics: { file: 'analytics-outline', label: 'Analytics' },
  people: { file: 'people-outline', label: 'Usuários' },
  cash: { file: 'cash-outline', label: 'Receita' },
  globe: { file: 'globe-outline', label: 'Global' },
  speed: { file: 'speedometer-outline', label: 'Velocidade' },
  rocket: { file: 'rocket-outline', label: 'Lançamento' },
  cart: { file: 'cart-outline', label: 'Carrinho' },
  store: { file: 'storefront-outline', label: 'Lojas' },
  shield: { file: 'shield-checkmark-outline', label: 'Segurança' },
  trophy: { file: 'trophy-outline', label: 'Meta' },
  wallet: { file: 'wallet-outline', label: 'Carteira' },
  star: { file: 'star-outline', label: 'Favorito' },
  flame: { file: 'flame-outline', label: 'Desempenho' },
  barChart: { file: 'briefcase-outline', label: 'Negócios' },
  headset: { file: 'headset-outline', label: 'Suporte' },
  calendar: { file: 'calendar-outline', label: 'Eventos' },
  megaphone: { file: 'megaphone-outline', label: 'Marketing' },
  heart: { file: 'heart-outline', label: 'Engajamento' },
  pulse: { file: 'pulse-outline', label: 'Saúde' },
};

export const CARD_ICON_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ICON_CONFIG).map(([key, config]) => [key, `${ION_BASE}/${config.file}.svg`])
);

export const CARD_ICON_OPTIONS = Object.entries(ICON_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
  src: `${ION_BASE}/${config.file}.svg`,
}));
