import { Platform } from 'react-native';

export const Shadows = {
  // iOS shadows
  ios: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  // Android shadows
  android: {
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  // Combined shadow for cross-platform
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: {
      elevation: 3,
    },
  }),
  button: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    android: {
      elevation: 2,
    },
  }),
};
