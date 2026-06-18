import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import 'state/app_state.dart';
import 'ui/home_page.dart';

void main() {
  runApp(const SurgeManageApp());
}

class SurgeManageApp extends StatelessWidget {
  const SurgeManageApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..init(),
      child: MaterialApp(
        title: 'Surge Manage',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(),
        builder: (context, child) => FTheme(
          data: FThemes.zinc.dark,
          child: child!,
        ),
        home: const HomePage(),
      ),
    );
  }
}
