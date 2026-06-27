import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:google_sign_in/google_sign_in.dart';

// Glowbloom mobile app = a thin shell around the live web app, PLUS a native
// Google sign-in bridge (Google blocks OAuth inside WebViews, so we sign in
// natively and inject the ID token into the web app).
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://glowbloom.treeantstechnologies.com/',
);

// The WEB OAuth client id, used as serverClientId so the native ID token's
// audience matches what the backend verifies (GOOGLE_CLIENT_ID).
const String kWebClientId =
    '318258264454-k63f3lnpmio66dv3eu7g0irvjljf1du7.apps.googleusercontent.com';

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

  final GoogleSignIn _gsi = GoogleSignIn(
    serverClientId: kWebClientId,
    scopes: const ['email', 'profile', 'openid'],
  );

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B0F1F))
      ..addJavaScriptChannel('GBNative', onMessageReceived: _onNativeMessage)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) { setState(() => loading = true); _injectNativeFlag(); },
        onPageFinished: (_) { setState(() => loading = false); _injectNativeFlag(); },
      ))
      ..loadRequest(Uri.parse(kAppUrl));
  }

  void _injectNativeFlag() {
    controller
        .runJavaScript("window.GB_NATIVE=true; window.dispatchEvent(new Event('gb-native-ready'));")
        .catchError((_) {});
  }

  Future<void> _onNativeMessage(JavaScriptMessage msg) async {
    try {
      final data = jsonDecode(msg.message);
      if (data is Map && data['action'] == 'google') {
        await _googleSignIn();
      }
    } catch (_) {}
  }

  Future<void> _googleSignIn() async {
    try {
      await _gsi.signOut().catchError((_) => null); // force the account chooser
      final account = await _gsi.signIn();
      if (account == null) return; // user cancelled
      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null || idToken.isEmpty) {
        await controller.runJavaScript(
            "window.toast && window.toast('Google sign-in: no ID token (check serverClientId / SHA-1).');");
        return;
      }
      final payload = jsonEncode({'credential': idToken});
      await controller.runJavaScript(
          "window.onGoogleCredential && window.onGoogleCredential($payload);");
    } catch (e) {
      final m = jsonEncode('Google sign-in error: ' + e.toString());
      await controller.runJavaScript("window.toast && window.toast($m);");
    }
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
