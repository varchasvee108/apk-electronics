// On the web, React Native Skia needs CanvasKit (WebAssembly) loaded before the app renders.
import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(() => {
  renderRootComponent(App);
});
