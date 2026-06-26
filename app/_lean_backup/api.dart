import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class Api {
  Api._();
  static final Api instance = Api._();

  static const base = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'https://glowbloom.treeantstechnologies.com');

  String? _token;
  Map<String, dynamic>? user;
  bool get isSignedIn => _token != null;

  Future<void> loadToken() async {
    final p = await SharedPreferences.getInstance();
    _token = p.getString('token');
  }

  Future<void> _save(String t) async {
    _token = t;
    final p = await SharedPreferences.getInstance();
    await p.setString('token', t);
  }

  Future<void> _clear() async {
    _token = null;
    user = null;
    final p = await SharedPreferences.getInstance();
    await p.remove('token');
  }

  Map<String, String> get _h => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };
  Uri _u(String p) => Uri.parse('$base$p');

  Future<String?> emailStart(String email) async {
    final r = await http.post(_u('/auth/email/start'),
        headers: _h, body: jsonEncode({'email': email}));
    return (jsonDecode(r.body) as Map)['devCode'] as String?;
  }

  Future<bool> emailVerify(String email, String code,
      {String? displayName, int? birthYear, bool acceptedTerms = true}) async {
    final r = await http.post(_u('/auth/email/verify'),
        headers: _h,
        body: jsonEncode({
          'email': email, 'code': code, 'displayName': displayName,
          'birthYear': birthYear, 'acceptedTerms': acceptedTerms, 'platform': 'web',
        }));
    if (r.statusCode != 200) return false;
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    await _save(j['token'] as String);
    user = j['user'] as Map<String, dynamic>?;
    return true;
  }

  Future<void> logout() async {
    try { await http.post(_u('/auth/logout'), headers: _h); } catch (_) {}
    await _clear();
  }

  Future<void> submitScore(int light, int level, double rad) async {
    try {
      await http.post(_u('/scores'),
          headers: _h,
          body: jsonEncode({'mode': 'JOURNEY', 'light': light, 'level': level, 'maxRadiance': rad}));
    } catch (_) {}
  }

  Future<Map<String, dynamic>> myStats() async {
    final r = await http.get(_u('/stats/me'), headers: _h);
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<List<dynamic>> top(String window) async {
    final r = await http.get(_u('/scores/top?mode=JOURNEY&window=$window'));
    return (jsonDecode(r.body) as Map)['top'] as List;
  }

  Future<int?> myRank(String window) async {
    final r = await http.get(_u('/scores/rank?mode=JOURNEY&window=$window'), headers: _h);
    if (r.statusCode != 200) return null;
    return (jsonDecode(r.body) as Map)['rank'] as int?;
  }
}
