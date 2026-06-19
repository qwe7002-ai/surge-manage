import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/types.dart';
import '../../state/app_state.dart';
import '../section_editor.dart';

class ConfigPanel extends StatefulWidget {
  const ConfigPanel({super.key});

  @override
  State<ConfigPanel> createState() => _ConfigPanelState();
}

class _ConfigPanelState extends State<ConfigPanel> {
  bool _proxies = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().refreshProfiles();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Proxies')),
              ButtonSegment(value: false, label: Text('Raw config')),
            ],
            selected: {_proxies},
            onSelectionChanged: (s) => setState(() => _proxies = s.first),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: _proxies
              ? const SectionEditor(
                  section: 'Proxy',
                  placeholder: 'MyNode = vmess, server.com, 443, username=uuid, …',
                  hint: 'Edits the [Proxy] section of the selected profile, then reloads.',
                )
              : const _RawConfig(),
        ),
      ],
    );
  }
}

class _RawConfig extends StatefulWidget {
  const _RawConfig();

  @override
  State<_RawConfig> createState() => _RawConfigState();
}

class _RawConfigState extends State<_RawConfig> {
  bool _effective = false;
  String _content = '';
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final state = context.read<AppState>();
      var text = _effective
          ? (await state.runConfig(SurgeAction.dumpProfileEffective)).stdout
          : (state.activeProfile == null
              ? ''
              : await state.readProfileText(state.activeProfile!));
      final trimmed = text.trim();
      if (_effective &&
          (trimmed == '(null)' || trimmed.endsWith('(null)'))) {
        text = 'Effective profile is not available from this Surge CLI context.';
      }
      if (!mounted) return;
      setState(() => _content = text);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('Effective')),
                ButtonSegment(value: false, label: Text('Original')),
              ],
              selected: {_effective},
              onSelectionChanged: (s) {
                setState(() => _effective = s.first);
                _load();
              },
            ),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18),
              onPressed: _loading ? null : _load,
            ),
          ],
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(_error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ),
        const SizedBox(height: 8),
        Expanded(
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(8),
            ),
            child: SingleChildScrollView(
              child: SelectableText(
                _content.isEmpty
                    ? (_loading ? 'Loading…' : 'No profile returned.')
                    : _content,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
