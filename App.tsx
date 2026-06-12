import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useFonts } from 'expo-font';
import { ScreenContainer } from './src/components/ScreenContainer';
import Dashboard from './src/screens/Dashboard';

// Web: a fonte Feather é servida de public/fonts (URL relativa, respeita o
// baseUrl /b3truva do GitHub Pages) — o caminho padrão via node_modules não
// é publicado pelo gh-pages e retornava 404 (ícones viravam quadrados).
// Nativo: carrega o .ttf empacotado pelo Metro normalmente.
// O family name 'feather' (minúsculo) precisa bater com o usado internamente
// pelo @expo/vector-icons, que então pula a injeção própria da fonte.
const FEATHER_FONT = Platform.OS === 'web'
  ? 'fonts/Feather.ttf'
  : require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf');

export default function App() {
  const [fontsLoaded] = useFonts({ feather: FEATHER_FONT });
  if (!fontsLoaded) return null;

  return (
    <ScreenContainer>
      <Dashboard />
      <StatusBar style="light" />
    </ScreenContainer>
  );
}
