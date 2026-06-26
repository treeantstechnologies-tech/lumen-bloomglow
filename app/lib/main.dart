import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

// Glowbloom mobile app = a thin shell around the live web app, so the mobile
// app and the website share the exact same UI and one codebase.
// Override the URL at build time with:
//   flutter run --dart-define=APP_URL=https://glowbloom.treeantstechnologies.com
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://glowbloom.treeantstechnologies.com/',
);

void main() => runApp(const GlowbloomApp());

class GlowbloomApp extends StatelessWidget {
  const GlowbloomApp({super.key});
  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Glowbloom',
      debugShowCheckedModeBanner: false,
      home: WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});
  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController controller;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B0F1F))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() => loading = true),
        onPageFinished: (_) => setState(() => loading = false),
      ))
      ..loadRequest(Uri.parse(kAppUrl));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        if (await controller.canGoBack()) {
          controller.goBack();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0B0F1F),
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: controller),
              if (loading)
                const Center(
                  child: CircularProgressIndicator(color: Color(0xFF7C5BFF)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
