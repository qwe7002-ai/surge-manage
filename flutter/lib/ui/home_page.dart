import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../core/types.dart';
import '../state/app_state.dart';
import 'host_list.dart';
import 'panels/config_panel.dart';
import 'panels/dashboard_panel.dart';
import 'panels/logs_panel.dart';
import 'panels/policies_panel.dart';
import 'panels/rules_panel.dart';

/// Top-level shell. The host list is the entry screen; tapping Connect pushes
/// the management screen with tabs. Everything is GUI — no shell is exposed.
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return FScaffold(
      header: const FHeader(title: Text('Surge Manage')),
      content: Consumer<AppState>(
        builder: (context, state, _) {
          if (state.isConnected) {
            return const _ManageView();
          }
          return const HostListView();
        },
      ),
    );
  }
}

class _ManageView extends StatelessWidget {
  const _ManageView();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ConnectionBar(state: state),
        const SizedBox(height: 8),
        Expanded(
          child: FTabs(
            children: const [
              FTabEntry(label: Text('Dashboard'), child: DashboardPanel()),
              FTabEntry(label: Text('Policies'), child: PoliciesPanel()),
              FTabEntry(label: Text('Rules'), child: RulesPanel()),
              FTabEntry(label: Text('Requests'), child: LogsPanel()),
              FTabEntry(label: Text('Config'), child: ConfigPanel()),
            ],
          ),
        ),
      ],
    );
  }
}

class _ConnectionBar extends StatelessWidget {
  const _ConnectionBar({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final host = state.selectedHost;
    return Row(
      children: [
        const Icon(Icons.wifi, size: 16, color: Colors.greenAccent),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            host == null
                ? 'Connected'
                : '${host.label} · ${host.username}@${host.host}',
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        FButton(
          style: FButtonStyle.outline,
          onPress: () => state.disconnect(),
          label: const Text('Disconnect'),
        ),
      ],
    );
  }
}

/// Shared loading/error helper for panels.
class PanelStatus extends StatelessWidget {
  const PanelStatus({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    if (state.lastError != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(
          state.lastError!,
          style: const TextStyle(color: Colors.redAccent, fontSize: 12),
        ),
      );
    }
    if (state.busy) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: LinearProgressIndicator(minHeight: 2),
      );
    }
    return const SizedBox.shrink();
  }
}

extension PhaseLabel on ConnectionPhase {
  String get label => switch (this) {
        ConnectionPhase.disconnected => 'Disconnected',
        ConnectionPhase.connecting => 'Connecting…',
        ConnectionPhase.connected => 'Connected',
        ConnectionPhase.error => 'Error',
      };
}
