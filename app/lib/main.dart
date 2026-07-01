import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

// Glowbloom mobile app = a thin shell around the live web app, plus a native
// Google sign-in bridge and Google AdMob (banner + interstitial + rewarded +
// app-open), with frequency caps and minor-safe gating.
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://glowbloom.treeantstechnologies.com/',
);

// The WEB OAuth client id, used as serverClientId so the native ID token's
// audience matches what the backend verifies (GOOGLE_CLIENT_ID).
const String kWebClientId =
    '318258264454-k63f3lnpmio66dv3eu7g0irvjljf1du7.apps.googleusercontent.com';

// ---------------------------------------------------------------------------
// AD CONFIG
// Serves Google TEST ads by DEFAULT. At launch, build with real ads via:
//     flutter build appbundle --dart-define=USE_REAL_ADS=true
// Using real ad IDs during development (or without a registered test device)
// is an AdMob policy violation, so keep this false until you publish.
// ---------------------------------------------------------------------------
const bool kUseRealAds =
    bool.fromEnvironment('USE_REAL_ADS', defaultValue: false);

// Google official TEST unit IDs (always safe to click).
const String _tBannerA = 'ca-app-pub-3940256099942544/6300978111';
const String _tBannerI = 'ca-app-pub-3940256099942544/2934735716';
const String _tInterA = 'ca-app-pub-3940256099942544/1033173712';
const String _tInterI = 'ca-app-pub-3940256099942544/4411468910';
const String _tRewardA = 'ca-app-pub-3940256099942544/5224354917';
const String _tRewardI = 'ca-app-pub-3940256099942544/1712485313';
const String _tOpenA = 'ca-app-pub-3940256099942544/9257395921';
const String _tOpenI = 'ca-app-pub-3940256099942544/5575463023';

// REAL AdMob unit IDs (Android). No iOS AdMob app exists yet, so iOS keeps the
// test IDs until an iOS app is registered in AdMob.
const String _rBannerA = 'ca-app-pub-2797353343514379/1066673227';
const String _rInterA = 'ca-app-pub-2797353343514379/4698383780';
const String _rRewardA = 'ca-app-pub-2797353343514379/3499862503';
const String _rOpenA = 'ca-app-pub-2797353343514379/5010209124';

bool get _isAndroid => Platform.isAndroid;
String get kBannerUnitId =>
    _isAndroid ? (kUseRealAds ? _rBannerA : _tBannerA) : _tBannerI;
String get kInterstitialUnitId =>
    _isAndroid ? (kUseRealAds ? _rInterA : _tInterA) : _tInterI;
String get kRewardedUnitId =>
    _isAndroid ? (kUseRealAds ? _rRewardA : _tRewardA) : _tRewardI;
String get kAppOpenUnitId =>
    _isAndroid ? (kUseRealAds ? _rOpenA : _tOpenA) : _tOpenI;

// Non-personalized by default (safe before a consent flow exists).
// TODO before public launch: add a UMP consent form to serve personalized ads
// where the user consents (GDPR / applicable regions).
AdRequest _adReq() => AdRequest(nonPersonalizedAds: true);

// Frequency caps
const int _interEveryGames = 2; // interstitial at most once per 2 games
const Duration _minFullscreenGap =
    Duration(seconds: 45); // min gap between ANY two full-screen ads
const Duration _appOpenMinGap = Duration(seconds: 30);
const Duration _appOpenMaxCache = Duration(hours: 4);

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

class _WebShellState extends State<WebShell> with WidgetsBindingObserver {
  late final WebViewController controller;
  bool loading = true;

  // ---- ad state ----
  bool _adsBlocked = false; // true for minors -> suppress all ads
  BannerAd? _banner;
  bool _bannerReady = false;
  bool _bannerVisible = true; // hidden during active gameplay

  InterstitialAd? _interstitial;
  int _gamesSinceInter = 0;
  DateTime? _lastFullscreen;
  bool _showingFullscreen = false;

  RewardedAd? _rewarded;

  AppOpenAd? _appOpen;
  DateTime? _appOpenLoadedAt;

  final GoogleSignIn _gsi = GoogleSignIn(
    serverClientId: kWebClientId,
    scopes: const ['email', 'profile', 'openid'],
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B0F1F))
      ..addJavaScriptChannel('GBNative', onMessageReceived: _onNativeMessage)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) {
          setState(() => loading = true);
          _injectNativeFlag();
        },
        onPageFinished: (_) {
          setState(() => loading = false);
          _injectNativeFlag();
        },
      ))
      ..loadRequest(Uri.parse(kAppUrl));
    _loadBanner();
    _loadInterstitial();
    _loadRewarded();
    _loadAppOpen();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _banner?.dispose();
    _interstitial?.dispose();
    _rewarded?.dispose();
    _appOpen?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Show an app-open ad when the user RETURNS to the app (not on cold start,
    // so a fresh launch is never greeted by an ad).
    if (state == AppLifecycleState.resumed) {
      _maybeShowAppOpen();
    }
  }

  void _injectNativeFlag() {
    controller
        .runJavaScript(
            "window.GB_NATIVE=true; window.dispatchEvent(new Event('gb-native-ready'));")
        .catchError((_) {});
  }

  bool get _canShowFullscreen {
    if (_adsBlocked || _showingFullscreen) return false;
    if (_lastFullscreen != null &&
        DateTime.now().difference(_lastFullscreen!) < _minFullscreenGap) {
      return false;
    }
    return true;
  }

  // ---------------- Banner ----------------
  void _loadBanner() {
    _banner = BannerAd(
      size: AdSize.banner,
      adUnitId: kBannerUnitId,
      request: _adReq(),
      listener: BannerAdListener(
        onAdLoaded: (_) {
          if (mounted) setState(() => _bannerReady = true);
        },
        onAdFailedToLoad: (ad, err) {
          ad.dispose();
          _banner = null;
        },
      ),
    )..load();
  }

  // ---------------- Interstitial (game-over) ----------------
  void _loadInterstitial() {
    if (_adsBlocked) return;
    InterstitialAd.load(
      adUnitId: kInterstitialUnitId,
      request: _adReq(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) => _interstitial = ad,
        onAdFailedToLoad: (err) => _interstitial = null,
      ),
    );
  }

  // Called at a game BOUNDARY: done=true after a finished game, done=false when
  // entering a game (before it starts). Only finished games advance the counter,
  // so the cap stays honest whichever boundary the ad lands on.
  void _adBoundary(bool done) {
    if (done) _gamesSinceInter++;
    if (_gamesSinceInter < _interEveryGames) return;
    if (!_canShowFullscreen || _interstitial == null) return;
    final ad = _interstitial!;
    _interstitial = null;
    _gamesSinceInter = 0;
    _showingFullscreen = true;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        _showingFullscreen = false;
        _lastFullscreen = DateTime.now();
        _loadInterstitial();
      },
      onAdFailedToShowFullScreenContent: (a, e) {
        a.dispose();
        _showingFullscreen = false;
        _loadInterstitial();
      },
    );
    ad.show();
  }

  // ---------------- Rewarded (opt-in) ----------------
  void _loadRewarded() {
    RewardedAd.load(
      adUnitId: kRewardedUnitId,
      request: _adReq(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) => _rewarded = ad,
        onAdFailedToLoad: (err) => _rewarded = null,
      ),
    );
  }

  void _showRewarded() {
    if (_adsBlocked) {
      controller
          .runJavaScript(
              "window.toast && window.toast('Rewarded ads are not available for this account.');")
          .catchError((_) {});
      return;
    }
    final ad = _rewarded;
    if (ad == null) {
      _loadRewarded();
      controller
          .runJavaScript(
              "window.toast && window.toast('Ad not ready yet — try again in a moment.');")
          .catchError((_) {});
      return;
    }
    _rewarded = null;
    _showingFullscreen = true;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        _showingFullscreen = false;
        _lastFullscreen = DateTime.now();
        _loadRewarded();
      },
      onAdFailedToShowFullScreenContent: (a, e) {
        a.dispose();
        _showingFullscreen = false;
        _loadRewarded();
      },
    );
    ad.show(onUserEarnedReward: (a, reward) {
      controller
          .runJavaScript("window.onAdReward && window.onAdReward();")
          .catchError((_) {});
    });
  }

  // ---------------- App Open (on resume) ----------------
  void _loadAppOpen() {
    if (_adsBlocked) return;
    AppOpenAd.load(
      adUnitId: kAppOpenUnitId,
      request: _adReq(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpen = ad;
          _appOpenLoadedAt = DateTime.now();
        },
        onAdFailedToLoad: (err) => _appOpen = null,
      ),
    );
  }

  void _maybeShowAppOpen() {
    if (!_canShowFullscreen) return;
    if (_lastFullscreen != null &&
        DateTime.now().difference(_lastFullscreen!) < _appOpenMinGap) return;
    final ad = _appOpen;
    if (ad == null) {
      _loadAppOpen();
      return;
    }
    if (_appOpenLoadedAt == null ||
        DateTime.now().difference(_appOpenLoadedAt!) > _appOpenMaxCache) {
      ad.dispose();
      _appOpen = null;
      _loadAppOpen();
      return;
    }
    _appOpen = null;
    _showingFullscreen = true;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        _showingFullscreen = false;
        _lastFullscreen = DateTime.now();
        _loadAppOpen();
      },
      onAdFailedToShowFullScreenContent: (a, e) {
        a.dispose();
        _showingFullscreen = false;
        _loadAppOpen();
      },
    );
    ad.show();
  }

  // ---------------- native <-> web bridge ----------------
  Future<void> _onNativeMessage(JavaScriptMessage msg) async {
    try {
      final data = jsonDecode(msg.message);
      if (data is! Map) return;
      switch (data['action']) {
        case 'google':
          await _googleSignIn();
          break;
        case 'rewarded':
          _showRewarded();
          break;
        case 'interstitial':
          _adBoundary(data['done'] == true);
          break;
        case 'banner':
          final show = data['show'] != false;
          if (mounted) setState(() => _bannerVisible = show);
          break;
        case 'adsConfig':
          final minor = data['minor'] == true;
          _adsBlocked = minor;
          if (minor) {
            _interstitial?.dispose();
            _interstitial = null;
            _appOpen?.dispose();
            _appOpen = null;
            if (mounted) setState(() => _bannerVisible = false);
          }
          break;
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
    final showBanner =
        _bannerReady && _banner != null && _bannerVisible && !_adsBlocked;
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
                        child: CircularProgressIndicator(
                            color: Color(0xFF7C5BFF)),
                      ),
                  ],
                ),
              ),
              if (showBanner)
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
