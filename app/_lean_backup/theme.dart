import 'package:flutter/material.dart';

class Gb {
  static const bg = Color(0xFF0B0F1F);
  static const surface = Color(0xFF131A30);
  static const text = Color(0xFFF2F4FA);
  static const muted = Color(0xFF8A93B2);
  static const primary = Color(0xFF7C5BFF);
  static const radiance = Color(0xFFFAC775);
  static const bloom = Color(0xFF9FE1CB);
  static const buds = <Color>[
    Color(0xFF8B7BFF), Color(0xFF22C39A), Color(0xFFFF7A45),
    Color(0xFF3D9BFF), Color(0xFFFFC23D), Color(0xFFFF5FA8),
    Color(0xFF9BD64A), Color(0xFFFF5D5D), Color(0xFF3FD9C2),
  ];
}

ThemeData glowbloomTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: Gb.bg,
    colorScheme: base.colorScheme.copyWith(primary: Gb.primary, surface: Gb.surface),
    appBarTheme: const AppBarTheme(backgroundColor: Colors.transparent, elevation: 0),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true, fillColor: Gb.surface,
      border: OutlineInputBorder(borderSide: BorderSide.none),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: Gb.primary, minimumSize: const Size.fromHeight(48)),
    ),
  );
}
