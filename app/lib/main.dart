import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

// Glowbloom mobile app = a thin shell around the live web app, PLUS a native
// Google sign-in bridge and Google AdMob (banner + rewarded).
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://glowbloom.treeantstechnologies.com/',
);

// The WEB OAuth client id, used as serverClientId so the native ID token's
// audience matches what the backend verifies (GOOGLE_CLIENT_ID).
const String kWebClientId =
    '318258264454-k63f3lnpmio66dv3eu7g0irvjljf1du7.apps.googleusercontent.com';

// ---------------------------------------------------------------------------
// AdMob unit IDs. These are Google's OFFICIAL TEST IDs — they always serve safe
// test ads. Before publishing: (1) replace these with your real AdMob unit IDs,
// (2) put the real AdMob *App ID* in AndroidManifest.xml + ios/Runner/Info.plist,
// (3) host app-ads.txt at the domain root. Using your real IDs in debug without
// registering your test device is an AdMob policy violation, so keep these for now.
// ---------------------------------------------------------------------------
String get kBannerUnitId => Platform.isIOS
    ? 'ca-app-pub-3940256099942544/2934735716'
    : 'ca-app-pub-3940256099942544/6300978111';
String get kRewardedUnitId => Platform.isIOS
    ? 'ca-app-pub-3940256099942544/1712485313'
    : 'ca-app-pub-3940256099942544/5224354917';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MobileAds.instance.initialize();
  runApp(const GlowbloomApp());
}

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

  BannerAd? _banner;
  bool _bannerReady = false;
  RewardedAd? _rewarded;

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
    _loadBanner();
    _loadRewarded();
  }

  @override
  void dispose() {
    _banner?.dispose();
    _rewarded?.dispose();
    super.dispose();
  }

  void _injectNativeFlag() {
    controller
        .runJavaScript("window.GB_NATIVE=true; window.dispatchEvent(new Event('gb-native-ready'));")
        .catchError((_) {});
  }

  // ---------------- Ads ----------------
  void _loadBanner() {
    _banner = BannerAd(
      size: AdSize.banner,
      adUnitId: kBannerUnitId,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (_) { if (mounted) setState(() => _bannerReady = true); },
        onAdFailedToLoad: (ad, err) { ad.dispose(); _banner = null; },
      ),
    )..load();
  }

  void _loadRewarded() {
    RewardedAd.load(
      adUnitId: kRewardedUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) { _rewarded = ad; },
        onAdFailedToLoad: (err) { _rewarded = null; },
      ),
    );
  }

  void _showRewarded() {
    final ad = _rewarded;
    if (ad == null) {
      _loadRewarded();
      controller.runJavaScript("window.toast && window.toast('Ad not ready yet — try again in a moment.');").catchError((_) {});
      return;
    }
    _rewarded = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) { a.dispose(); _loadRewarded(); },
      onAdFailedToShowFullScreenContent: (a, e) { a.dispose(); _loadRewarded(); },
    );
    ad.show(onUserEarnedReward: (a, reward) {
      controller.runJavaScript("window.onAdReward && window.onAdReward();").catchError((_) {});
    });
  }

  Future<void> _onNativeMessage(JavaScriptMessage msg) async {
    try {
      final data = jsonDecode(msg.message);
      if (data is Map) {
        if (data['action'] == 'google') {
          await _googleSignIn();
        } else if (data['action'] == 'rewarded') {
          _showRewarded();
        }
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
          child: Column(
            children: [
              Expanded(
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
              if (_bannerReady && _banner != null)
                Container(
                  color: const Color(0xFF0B0F1F),
                  alignment: Alignment.center,
                  width: double.infinity,
                  height: _banner!.size.height.toDouble(),
                  child: SizedBox(
                    width: _banner!.size.width.toDouble(),
                    height: _banner!.size.height.toDouble(),
                    child: AdWidget(ad: _banner!),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
