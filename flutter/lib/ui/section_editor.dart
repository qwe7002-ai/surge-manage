import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';

/// Per-entry editor for one section of the active profile config. Reads the
/// section's entry lines over SFTP, lets the user add/edit/delete them, and on
/// save rewrites just that section and reloads Surge. Mirror of the Electron
/// `SectionEditor`.
class SectionEditor extends StatefulWidget {
  const SectionEditor({
    super.key,
    required this.section,
    required this.placeholder,
    this.hint,
  });

  final String section;
  final String placeholder;
  final String? hint;

  @override
  State<SectionEditor> createState() => _SectionEditorState();
}

class _SectionEditorState extends State<SectionEditor> {
  final List<TextEditingController> _ctrls = [];
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
    for (final c in _ctrls) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load(String profile) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final entries =
          await context.read<AppState>().readProfileSection(profile, widget.section);
      if (!mounted) return;
      for (final c in _ctrls) {
        c.dispose();
      }
      _ctrls
        ..clear()
        ..addAll(entries.map((e) => TextEditingController(text: e)));
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
    final entries =
        _ctrls.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();
    try {
      await context
          .read<AppState>()
          .writeProfileSection(profile, widget.section, entries);
      if (mounted) setState(() => _dirty = false);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    // Reload when the active profile changes from elsewhere.
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
            if (_dirty)
              const Text('unsaved',
                  style: TextStyle(color: Colors.amber, fontSize: 12)),
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.refresh, size: 18),
              onPressed:
                  _loading || active == null ? null : () => _load(active),
            ),
            FButton(
              onPress: state.busy || !_dirty ? null : _save,
              label: const Text('Save & reload'),
            ),
          ],
        ),
        if (widget.hint != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(widget.hint!,
                style: const TextStyle(color: Colors.white54, fontSize: 12)),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(_error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ),
        Expanded(
          child: ListView.builder(
            itemCount: _ctrls.length + 1,
            itemBuilder: (context, i) {
              if (i == _ctrls.length) {
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FButton(
                      style: FButtonStyle.outline,
                      onPress: () => setState(() {
                        _ctrls.add(TextEditingController());
                        _dirty = true;
                      }),
                      label: const Text('Add entry'),
                    ),
                  ),
                );
              }
              return Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _ctrls[i],
                        style: const TextStyle(
                            fontFamily: 'monospace', fontSize: 12),
                        decoration: InputDecoration(
                          hintText: widget.placeholder,
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
                        _ctrls[i].dispose();
                        _ctrls.removeAt(i);
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
