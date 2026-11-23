export type NavId =
  | 'dashboard'
  | 'sales'
  | 'suppliers'
  | 'expenses'
  | 'staff'
  | 'analytics'
  | 'menu'
  | 'pos'
  | 'settings'
  | 'profile';

export const NAV_ITEMS: { id: NavId; name: string }[] = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'sales', name: 'Sales' },
  { id: 'suppliers', name: 'Suppliers' },
  { id: 'expenses', name: 'Expenses' },
  { id: 'staff', name: 'Manage Staff' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'menu', name: 'Menu' },
  { id: 'pos', name: 'POS Billing' },
];

export const NAV_BOTTOM: { id: NavId; name: string }[] = [
  { id: 'settings', name: 'Settings' },
  { id: 'profile', name: 'User' },
];
