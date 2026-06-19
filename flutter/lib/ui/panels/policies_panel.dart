import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/types.dart';
import '../../state/app_state.dart';
import '../home_page.dart';
import '../section_editor.dart';

const _autoValue = '__auto__';

class PoliciesPanel extends StatefulWidget {
  const PoliciesPanel({super.key});

  @override
  State<PoliciesPanel> createState() => _PoliciesPanelState();
}

class _PoliciesPanelState extends State<PoliciesPanel> {
  bool _editingProxies = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>()
        ..refreshPolicies()
        ..refreshProfiles();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final proxies = state.policies?.proxies ?? const [];
    final groups = state.policies?.groups ?? const [];
    final allPolicies = {...proxies, ...groups}.toList();
    final globalPolicy = state.environment?.globalPolicy;
    final policyOptions =
        globalPolicy != null && !allPolicies.contains(globalPolicy)
            ? [globalPolicy, ...allPolicies]
            : allPolicies;

    return ListView(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${groups.length} groups · ${proxies.length} proxies',
                style: const TextStyle(color: Colors.white54, fontSize: 13),
              ),
            ),
            if (policyOptions.isNotEmpty) ...[
              const Text('Global',
                  style: TextStyle(fontSize: 13, color: Colors.white54)),
              const SizedBox(width: 8),
              DropdownButton<String>(
                value: globalPolicy,
                hint: const Text('policy…'),
                items: policyOptions
                    .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                    .toList(),
                onChanged: state.busy || state.environment?.proxyMode != 1
                    ? null
                    : (p) => p != null ? state.setGlobalPolicy(p) : null,
              ),
              const SizedBox(width: 8),
            ],
            FButton(
              onPress: state.busy ? null : () => state.testAllPolicies(),
              label: const Text('Test all'),
            ),
          ],
        ),
        PanelStatus(state: state),
        const SizedBox(height: 8),
        FCard(
          title: Row(
            children: [
              const Text('Proxies'),
              const Spacer(),
              TextButton.icon(
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: Text(_editingProxies ? 'Done' : 'Edit'),
                onPressed: () =>
                    setState(() => _editingProxies = !_editingProxies),
              ),
            ],
          ),
          child: _editingProxies
              ? const SizedBox(
                  height: 420,
                  child: SectionEditor(
                    section: 'Proxy',
                    placeholder:
                        'MyNode = vmess, server.com, 443, username=uuid, …',
                    hint:
                        'Edits the [Proxy] section of the selected profile, then reloads.',
                  ),
                )
              : Column(
                  children: [
                    for (final p in proxies)
                      _ProxyRow(
                        name: p,
                        test: state.policyTests[p],
                        enabled: !state.busy,
                        onTap: () => state.testPolicy(p),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Policy groups'),
          child: Column(
            children: [
              if (groups.isEmpty)
                const Text('No policy groups.',
                    style: TextStyle(color: Colors.white54)),
              for (final g in groups)
                _GroupRow(
                  group: g,
                  groupType: state.policies?.groupTypes[g],
                  candidates: _candidatesFor(
                    group: g,
                    members: state.subPolicies[g] ?? const [],
                    proxies: proxies,
                    groups: groups,
                    selected: state.environment?.autoOverride[g] ??
                        state.environment?.selection[g],
                  ),
                  members: state.subPolicies[g] ?? const [],
                  selected: state.environment?.selection[g],
                  override: state.environment?.autoOverride[g],
                  busy: state.busy,
                  onSelect: (p) => state.selectPolicy(g, p),
                  onOverride: (p) => state.overridePolicy(g, p),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Candidate nodes for a group's selector. Prefer the group's known
/// sub-policies; when unknown, fall back to all proxies and other groups. The
/// current selection is always included.
List<String> _candidatesFor({
  required String group,
  required List<String> members,
  required List<String> proxies,
  required List<String> groups,
  required String? selected,
}) {
  final base = members.isNotEmpty
      ? members
      : [...proxies, ...groups.where((x) => x != group)];
  if (selected != null && !base.contains(selected)) {
    return [selected, ...base];
  }
  return base;
}

class _GroupRow extends StatelessWidget {
  const _GroupRow({
    required this.group,
    required this.groupType,
    required this.candidates,
    required this.members,
    required this.selected,
    required this.override,
    required this.busy,
    required this.onSelect,
    required this.onOverride,
  });

  final String group;
  final String? groupType;
  final List<String> candidates;
  final List<String> members;
  final String? selected;
  final String? override;
  final bool busy;
  final ValueChanged<String> onSelect;
  final ValueChanged<String?> onOverride;

  @override
  Widget build(BuildContext context) {
    final autoCurrent =
        _isAutoGroup(groupType) && selected != null && candidates.contains(selected)
            ? selected
            : null;
    final autoLabel = autoCurrent == null ? 'Auto' : 'Auto · $autoCurrent';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 96,
            child: Text(group, overflow: TextOverflow.ellipsis),
          ),
          _GroupTypeBadge(type: groupType),
          const SizedBox(width: 8),
          Expanded(
            child: _isAutoGroup(groupType)
                ? Tooltip(
                    message: members.isEmpty ? 'Auto' : members.join(', '),
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: override ?? _autoValue,
                      items: [
                        DropdownMenuItem(
                          value: _autoValue,
                          child: Text(autoLabel),
                        ),
                        for (final m in candidates)
                          DropdownMenuItem(value: m, child: Text(m)),
                      ],
                      onChanged: busy
                          ? null
                          : (m) => onOverride(
                                m == null || m == _autoValue ? null : m,
                              ),
                    ),
                  )
                : candidates.isEmpty
                ? Text(selected ?? '—',
                    style: const TextStyle(color: Colors.white54, fontSize: 13))
                : DropdownButton<String>(
                    isExpanded: true,
                    value: candidates.contains(selected) ? selected : null,
                    hint: const Text('select…'),
                    items: candidates
                        .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                        .toList(),
                    onChanged: busy ? null : (m) => m != null ? onSelect(m) : null,
                  ),
          ),
        ],
      ),
    );
  }
}

bool _isAutoGroup(String? type) => type != null && type != 'select' && type != 'unknown';

class _GroupTypeBadge extends StatelessWidget {
  const _GroupTypeBadge({required this.type});

  final String? type;

  @override
  Widget build(BuildContext context) {
    final label = type ?? 'unknown';
    final auto = _isAutoGroup(type);
    return Container(
      width: 58,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: auto ? Colors.white10 : Colors.transparent,
        border: Border.all(color: Colors.white24),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(color: Colors.white54, fontSize: 11),
      ),
    );
  }
}

class _ProxyRow extends StatelessWidget {
  const _ProxyRow({
    required this.name,
    required this.enabled,
    required this.onTap,
    this.test,
  });
  final String name;
  final bool enabled;
  final VoidCallback onTap;
  final PolicyTest? test;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          children: [
            Expanded(child: Text(name, overflow: TextOverflow.ellipsis)),
            _latency(),
          ],
        ),
      ),
    );
  }

  Widget _latency() {
    final t = test;
    if (t == null) {
      return const Text('—', style: TextStyle(color: Colors.white38, fontSize: 12));
    }
    if (t.error != null) {
      return const Text('failed',
          style: TextStyle(color: Colors.redAccent, fontSize: 12));
    }
    final ms = t.latencyMs;
    if (ms == null) {
      return const Text('—', style: TextStyle(color: Colors.white38, fontSize: 12));
    }
    final color = ms < 300
        ? Colors.greenAccent
        : ms < 800
            ? Colors.amberAccent
            : Colors.redAccent;
    return Text('$ms ms', style: TextStyle(color: color, fontSize: 12));
  }
}
