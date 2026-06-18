import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../core/types.dart';
import '../state/app_state.dart';

class HostForm extends StatefulWidget {
  const HostForm({super.key, this.initial});
  final HostConfig? initial;

  @override
  State<HostForm> createState() => _HostFormState();
}

class _HostFormState extends State<HostForm> {
  late final TextEditingController _label;
  late final TextEditingController _host;
  late final TextEditingController _port;
  late final TextEditingController _username;
  late final TextEditingController _keyPath;
  late final TextEditingController _surgeBin;
  late final TextEditingController _secret;
  AuthMethod _auth = AuthMethod.key;

  @override
  void initState() {
    super.initState();
    final h = widget.initial;
    _label = TextEditingController(text: h?.label ?? '');
    _host = TextEditingController(text: h?.host ?? '');
    _port = TextEditingController(text: (h?.port ?? 22).toString());
    _username = TextEditingController(text: h?.username ?? 'root');
    _keyPath = TextEditingController(text: h?.privateKeyPath ?? '');
    _surgeBin = TextEditingController(text: h?.surge.bin ?? 'surge');
    _secret = TextEditingController();
    _auth = h?.auth ?? AuthMethod.key;
  }

  @override
  void dispose() {
    for (final c in [_label, _host, _port, _username, _keyPath, _surgeBin, _secret]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final state = context.read<AppState>();
    final id = widget.initial?.id ?? const Uuid().v4();
    final needsSecret = _auth == AuthMethod.password ||
        (_auth == AuthMethod.key && _secret.text.isNotEmpty);
    final secretRef = needsSecret ? 'host:$id' : widget.initial?.secretRef;

    final host = HostConfig(
      id: id,
      label: _label.text.trim().isEmpty ? _host.text.trim() : _label.text.trim(),
      host: _host.text.trim(),
      port: int.tryParse(_port.text.trim()) ?? 22,
      username: _username.text.trim(),
      auth: _auth,
      privateKeyPath:
          _auth == AuthMethod.key && _keyPath.text.trim().isNotEmpty ? _keyPath.text.trim() : null,
      secretRef: secretRef,
      surge: SurgeProfile(bin: _surgeBin.text.trim().isEmpty ? 'surge' : _surgeBin.text.trim()),
      createdAt: widget.initial?.createdAt ?? DateTime.now().millisecondsSinceEpoch,
      lastConnectedAt: widget.initial?.lastConnectedAt,
    );
    await state.saveHost(host, secret: _secret.text);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.initial == null ? 'Add host' : 'Edit host',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            FTextField(controller: _label, label: const Text('Label'), hint: 'Tokyo node'),
            const SizedBox(height: 12),
            FTextField(controller: _host, label: const Text('Host'), hint: '203.0.113.7'),
            const SizedBox(height: 12),
            FTextField(
              controller: _port,
              label: const Text('Port'),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            FTextField(controller: _username, label: const Text('Username')),
            const SizedBox(height: 12),
            _AuthSelector(
              value: _auth,
              onChanged: (a) => setState(() => _auth = a),
            ),
            const SizedBox(height: 12),
            if (_auth == AuthMethod.key) ...[
              FTextField(
                controller: _keyPath,
                label: const Text('Private key path'),
                hint: '~/.ssh/id_ed25519',
              ),
              const SizedBox(height: 12),
              FTextField(
                controller: _secret,
                label: const Text('Key passphrase (optional)'),
                obscureText: true,
              ),
              const SizedBox(height: 12),
            ],
            if (_auth == AuthMethod.password) ...[
              FTextField(
                controller: _secret,
                label: const Text('Password'),
                obscureText: true,
              ),
              const SizedBox(height: 12),
            ],
            FTextField(controller: _surgeBin, label: const Text('Surge binary')),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: FButton(
                    style: FButtonStyle.outline,
                    onPress: () => Navigator.of(context).pop(),
                    label: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FButton(onPress: _save, label: const Text('Save')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthSelector extends StatelessWidget {
  const _AuthSelector({required this.value, required this.onChanged});
  final AuthMethod value;
  final ValueChanged<AuthMethod> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Authentication', style: TextStyle(fontSize: 13)),
        const SizedBox(height: 6),
        SegmentedButton<AuthMethod>(
          segments: const [
            ButtonSegment(value: AuthMethod.key, label: Text('Key')),
            ButtonSegment(value: AuthMethod.password, label: Text('Password')),
            ButtonSegment(value: AuthMethod.agent, label: Text('Agent')),
          ],
          selected: {value},
          onSelectionChanged: (s) => onChanged(s.first),
        ),
      ],
    );
  }
}
