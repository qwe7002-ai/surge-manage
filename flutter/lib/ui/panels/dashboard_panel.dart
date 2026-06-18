import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/parsers.dart';
import '../../core/types.dart';
import '../../state/app_state.dart';
import '../home_page.dart';

const _logLevels = ['verbose', 'info', 'notify', 'warning'];

class DashboardPanel extends StatelessWidget {
  const DashboardPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final env = state.environment;
    final traffic = state.traffic;
    final envEntries = env?.fields.entries.toList() ?? const [];

    return ListView(
      children: [
        PanelStatus(state: state),
        FCard(
          title: const Text('Connections'),
          subtitle: Text('${traffic?.connections ?? 0} active'),
          child: Column(
            children: [
              _row('Down (session)', formatBytes(traffic?.downloadTotal)),
              _row('Up (session)', formatBytes(traffic?.uploadTotal)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Environment'),
          child: Column(
            children: [
              if (envEntries.isEmpty)
                const Text('No data.', style: TextStyle(color: Colors.white54))
              else
                ...envEntries.map((e) => _row(e.key, e.value)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Control'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FButton(
                    onPress:
                        state.busy ? null : () => state.runAction(SurgeAction.reload),
                    label: const Text('Reload'),
                  ),
                  FButton(
                    style: FButtonStyle.secondary,
                    onPress:
                        state.busy ? null : () => state.runAction(SurgeAction.flushDns),
                    label: const Text('Flush DNS'),
                  ),
                  FButton(
                    style: FButtonStyle.secondary,
                    onPress: state.busy
                        ? null
                        : () => state.runAction(SurgeAction.testNetwork),
                    label: const Text('Test network'),
                  ),
                  FButton(
                    style: FButtonStyle.secondary,
                    onPress: state.busy
                        ? null
                        : () => state.runAction(SurgeAction.diagnostics),
                    label: const Text('Diagnostics'),
                  ),
                  FButton(
                    style: FButtonStyle.destructive,
                    onPress:
                        state.busy ? null : () => state.runAction(SurgeAction.stop),
                    label: const Text('Stop Surge'),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text('Log level',
                      style: TextStyle(fontSize: 13, color: Colors.white54)),
                  const SizedBox(width: 8),
                  DropdownButton<String>(
                    hint: const Text('set…'),
                    items: _logLevels
                        .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                        .toList(),
                    onChanged: state.busy
                        ? null
                        : (v) {
                            if (v != null) {
                              state.runAction(SurgeAction.setLogLevel, [v]);
                            }
                          },
                  ),
                ],
              ),
            ],
          ),
        ),
        if (state.lastInfo != null) ...[
          const SizedBox(height: 12),
          FCard(
            title: const Text('Last result'),
            child: SelectableText(
              state.lastInfo!,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
            ),
          ),
        ],
      ],
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
              child: Text(label,
                  style: const TextStyle(color: Colors.white54, fontSize: 13)),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
              ),
            ),
          ],
        ),
      );
}
