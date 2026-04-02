import { Colors } from './colors';

export const Typography = {
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.textPrimary,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: Colors.textSecondary,
  },
  price: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  priceLarge: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
};
