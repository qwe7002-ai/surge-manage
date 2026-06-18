import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/parsers.dart';
import '../../core/types.dart';
import '../../state/app_state.dart';
import '../home_page.dart';

class DashboardPanel extends StatelessWidget {
  const DashboardPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final status = state.status;
    final traffic = state.traffic;

    return ListView(
      children: [
        PanelStatus(state: state),
        FCard(
          title: const Text('Surge daemon'),
          subtitle: Text(status?.running == true ? 'Running' : 'Stopped'),
          child: Column(
            children: [
              _row('Version', status?.version ?? '—'),
              _row('Outbound mode', status?.outboundMode ?? status?.mode ?? '—'),
              _row('Active policy', status?.activePolicy ?? '—'),
              _row('Uptime', _uptime(status?.uptimeSeconds)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Throughput'),
          child: Column(
            children: [
              _row('Download', formatBps(traffic?.downloadBps)),
              _row('Upload', formatBps(traffic?.uploadBps)),
              _row('Connections',
                  traffic?.connections != null ? '${traffic!.connections}' : '—'),
              _row('Downloaded total', formatBytes(traffic?.downloadTotal)),
              _row('Uploaded total', formatBytes(traffic?.uploadTotal)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        FCard(
          title: const Text('Daemon control'),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FButton(
                onPress: state.busy ? null : () => state.power(SurgeAction.start),
                label: const Text('Start'),
              ),
              FButton(
                style: FButtonStyle.secondary,
                onPress: state.busy ? null : () => state.power(SurgeAction.reload),
                label: const Text('Reload'),
              ),
              FButton(
                style: FButtonStyle.secondary,
                onPress: state.busy ? null : () => state.power(SurgeAction.restart),
                label: const Text('Restart'),
              ),
              FButton(
                style: FButtonStyle.destructive,
                onPress: state.busy ? null : () => state.power(SurgeAction.stop),
                label: const Text('Stop'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13)),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
              ),
            ),
          ],
        ),
      );

  String _uptime(int? seconds) {
    if (seconds == null || seconds <= 0) return '—';
    final d = seconds ~/ 86400;
    final h = (seconds % 86400) ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    if (d > 0) return '${d}d ${h}h';
    if (h > 0) return '${h}h ${m}m';
    return '${m}m';
  }
}
