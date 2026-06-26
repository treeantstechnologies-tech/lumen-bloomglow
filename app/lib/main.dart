import 'package:flutter/material.dart';
import 'api.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';

void main() => runApp(const GlowbloomApp());

class GlowbloomApp extends StatelessWidget {
  const GlowbloomApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Glowbloom',
      debugShowCheckedModeBanner: false,
      theme: glowbloomTheme(),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _loading = true;
  bool _authed = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    await Api.instance.loadToken();
    setState(() {
      _authed = Api.instance.isSignedIn;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return _authed
        ? HomeScreen(onLogout: () => setState(() => _authed = false))
        : LoginScreen(onAuthed: () => setState(() => _authed = true));
  }
}
