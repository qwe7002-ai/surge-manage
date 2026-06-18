import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../core/config_doc.dart';
import '../state/app_state.dart';

/// Editor for the active profile's `[Rule]` section. Surfaces `#`-disabled
/// rules with an enable/disable switch and preserves them on save (a disabled
/// rule is written back as `# <rule>`). Mirror of the Electron `RuleEditor`.
class RuleEditor extends StatefulWidget {
  const RuleEditor({super.key});

  @override
  State<RuleEditor> createState() => _RuleEditorState();
}

class _Row {
  _Row(this.ctrl, this.enabled);
  final TextEditingController ctrl;
  bool enabled;
}

class _RuleEditorState extends State<RuleEditor> {
  final List<_Row> _rows = [];
  bool _dirty = false;
  bool _loading = false;
  String? _error;
  String? _loadedProfile;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = context.read<AppState>().activeProfile;
      if (p != null) _load(p);
    });
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.ctrl.dispose();
    }
    super.dispose();
  }

  Future<void> _load(String profile) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final entries = await context.read<AppState>().readProfileRules(profile);
      if (!mounted) return;
      for (final r in _rows) {
        r.ctrl.dispose();
      }
      _rows
        ..clear()
        ..addAll(entries
            .map((e) => _Row(TextEditingController(text: e.text), e.enabled)));
      setState(() {
        _dirty = false;
        _loadedProfile = profile;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final profile = context.read<AppState>().activeProfile;
    if (profile == null) return;
    final entries = _rows
        .map((r) => RuleEntry(text: r.ctrl.text.trim(), enabled: r.enabled))
        .where((e) => e.text.isNotEmpty)
        .toList();
    try {
      await context.read<AppState>().writeProfileRules(profile, entries);
      if (mounted) setState(() => _dirty = false);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final active = state.activeProfile;
    if (active != null && active != _loadedProfile && !_loading) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load(active));
    }

    if (state.profiles.isEmpty) {
      return const Center(
        child: Text('No profiles found. Set the host config directory.',
            style: TextStyle(color: Colors.white54)),
      );
    }

    final disabledCount = _rows.where((r) => !r.enabled).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            DropdownButton<String>(
              value: active,
              items: [
                for (final p in state.profiles)
                  DropdownMenuItem(value: p, child: Text('$p.conf')),
              ],
              onChanged: (v) => v != null ? state.setActiveProfile(v) : null,
            ),
            const SizedBox(width: 8),
            if (disabledCount > 0)
              Text('$disabledCount disabled',
                  style: const TextStyle(color: Colors.white54, fontSize: 12)),
            const SizedBox(width: 8),
            if (_dirty)
              const Text('unsaved',
                  style: TextStyle(color: Colors.amber, fontSize: 12)),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18),
              onPressed: _loading || active == null ? null : () => _load(active),
            ),
            FButton(
              onPress: state.busy || !_dirty ? null : _save,
              label: const Text('Save & reload'),
            ),
          ],
        ),
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 4),
          child: Text(
            'Edits the [Rule] section, then reloads. A disabled rule is kept as # in the config.',
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(_error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ),
        Expanded(
          child: ListView.builder(
            itemCount: _rows.length + 1,
            itemBuilder: (context, i) {
              if (i == _rows.length) {
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FButton(
                      style: FButtonStyle.outline,
                      onPress: () => setState(() {
                        _rows.add(_Row(TextEditingController(), true));
                        _dirty = true;
                      }),
                      label: const Text('Add rule'),
                    ),
                  ),
                );
              }
              final row = _rows[i];
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  children: [
                    Switch(
                      value: row.enabled,
                      onChanged: (v) => setState(() {
                        row.enabled = v;
                        _dirty = true;
                      }),
                    ),
                    Expanded(
                      child: TextField(
                        controller: row.ctrl,
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                          color: row.enabled ? null : Colors.white38,
                          decoration: row.enabled
                              ? null
                              : TextDecoration.lineThrough,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'DOMAIN-SUFFIX,example.com,Proxy',
                          isDense: true,
                        ),
                        onChanged: (_) {
                          if (!_dirty) setState(() => _dirty = true);
                        },
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.delete_outline,
                          size: 18, color: Colors.redAccent),
                      onPressed: () => setState(() {
                        _rows[i].ctrl.dispose();
                        _rows.removeAt(i);
                        _dirty = true;
                      }),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
