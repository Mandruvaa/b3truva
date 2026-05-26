import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { ScreenContainer } from './src/components/ScreenContainer';
import Dashboard from './src/screens/Dashboard';

export default function App() {
  return (
    <ScreenContainer>
      <Dashboard />
      <StatusBar style="light" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({});
