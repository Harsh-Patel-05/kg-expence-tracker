export type MenuCategoryId = 'all' | 'pulao' | 'reg-bhaji';

export const MENU_CATEGORIES: { id: MenuCategoryId; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'pulao', name: 'Pulao' },
  { id: 'reg-bhaji', name: 'Reg Bhaji' },
];

export type MenuItem = {
  id: string;
  name: string;
  categoryLabel: string;
  category: Exclude<MenuCategoryId, 'all'>;
  price: number;
  image: string;
};

export const SAMPLE_MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    name: 'Bowl Bhaji',
    categoryLabel: 'Reg Bhaji',
    category: 'reg-bhaji',
    price: 120,
    image: '🍲',
  },
  {
    id: '2',
    name: 'Jain Pulao',
    categoryLabel: 'Pulao',
    category: 'pulao',
    price: 180,
    image: '🍚',
  },
  {
    id: '3',
    name: 'Veg Pulao',
    categoryLabel: 'Pulao',
    category: 'pulao',
    price: 160,
    image: '🍛',
  },
  {
    id: '4',
    name: 'Dal Tadka',
    categoryLabel: 'Reg Bhaji',
    category: 'reg-bhaji',
    price: 90,
    image: '🥘',
  },
  {
    id: '5',
    name: 'Paneer Bhurji',
    categoryLabel: 'Reg Bhaji',
    category: 'reg-bhaji',
    price: 220,
    image: '🧀',
  },
  {
    id: '6',
    name: 'Jeera Rice',
    categoryLabel: 'Pulao',
    category: 'pulao',
    price: 100,
    image: '🍚',
  },
];
