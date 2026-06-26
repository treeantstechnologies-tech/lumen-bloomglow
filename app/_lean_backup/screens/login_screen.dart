import 'dart:convert';
import 'package:flutter/material.dart';
import '../api.dart';
import '../theme.dart';

const String _logoB64 =
    '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';

class LoginScreen extends StatefulWidget {
  final VoidCallback onAuthed;
  const LoginScreen({super.key, required this.onAuthed});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final code = TextEditingController();
  final first = TextEditingController();
  final last = TextEditingController();
  bool codeSent = false;
  bool busy = false;
  String? devCode;
  String? error;

  Future<void> sendCode() async {
    if (email.text.trim().isEmpty) {
      setState(() => error = 'Please enter your email');
      return;
    }
    setState(() { busy = true; error = null; });
    try {
      final dc = await Api.instance.emailStart(email.text.trim());
      setState(() { codeSent = true; devCode = dc; });
    } catch (_) {
      setState(() => error = 'Could not reach the server. Check the API URL / connection.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    final name = ('${first.text.trim()} ${last.text.trim()}').trim();
    final ok = await Api.instance.emailVerify(email.text.trim(), code.text.trim(),
        displayName: name.isEmpty ? null : name);
    if (mounted) setState(() => busy = false);
    if (ok) {
      widget.onAuthed();
    } else {
      setState(() => error = 'Invalid or expired code.');
    }
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Gb.muted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                Center(child: Image.memory(base64Decode(_logoB64), height: 76)),
                const SizedBox(height: 10),
                ShaderMask(
                  shaderCallback: (r) => const LinearGradient(
                    colors: [Color(0xFFFFB347), Color(0xFFFF7AC6), Color(0xFF7C9BFF)],
                  ).createShader(r),
                  child: const Text('Glowbloom',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white)),
                ),
                const SizedBox(height: 6),
                const Center(child: Text('Where memory blooms into light.',
                    style: TextStyle(fontStyle: FontStyle.italic, color: Gb.muted))),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Gb.surface.withOpacity(0.6),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(child: Text(codeSent ? 'Verify your email' : 'Welcome',
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700))),
                      const SizedBox(height: 14),
                      if (!codeSent) ...[
                        Row(children: [
                          Expanded(child: TextField(controller: first, decoration: _dec('First name'))),
                          const SizedBox(width: 10),
                          Expanded(child: TextField(controller: last, decoration: _dec('Last name'))),
                        ]),
                        const SizedBox(height: 10),
                        TextField(controller: email, keyboardType: TextInputType.emailAddress,
                            decoration: _dec('Email (required)')),
                        const SizedBox(height: 16),
                        FilledButton(
                            onPressed: busy ? null : sendCode,
                            child: Text(busy ? 'Sending…' : 'Send verification code')),
                      ] else ...[
                        Text('Code sent to ${email.text.trim()}',
                            textAlign: TextAlign.center, style: const TextStyle(color: Gb.muted)),
                        if (devCode != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Center(child: Text('Demo code: $devCode',
                                style: const TextStyle(color: Gb.radiance, fontWeight: FontWeight.bold, fontSize: 16))),
                          ),
                        const SizedBox(height: 12),
                        TextField(controller: code, keyboardType: TextInputType.number,
                            textAlign: TextAlign.center, decoration: _dec('6-digit code')),
                        const SizedBox(height: 16),
                        FilledButton(onPressed: busy ? null : verify, child: const Text('Verify & continue')),
                        TextButton(onPressed: () => setState(() => codeSent = false), child: const Text('Back')),
                      ],
                      if (error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(error!, textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.redAccent)),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const Center(child: Text('By continuing you agree to our Terms & Privacy.',
                    style: TextStyle(color: Gb.muted, fontSize: 11))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
