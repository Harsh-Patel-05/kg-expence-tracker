import { StatusBar } from 'expo-status-bar';
import { POSScreen } from './src/screens/POSScreen';

export default function App() {
  return (
    <>
      <POSScreen />
      <StatusBar style="dark" />
    </>
  );
}
