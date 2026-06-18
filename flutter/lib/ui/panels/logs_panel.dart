import 'package:flutter/material.dart';
import 'package:forui/forui.dart';
import 'package:provider/provider.dart';

import '../../core/types.dart';
import '../../state/app_state.dart';

class LogsPanel extends StatefulWidget {
  const LogsPanel({super.key});

  @override
  State<LogsPanel> createState() => _LogsPanelState();
}

class _LogsPanelState extends State<LogsPanel> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().startLogs();
    });
  }

  @override
  void dispose() {
    context.read<AppState>().stopLogs();
    _scroll.dispose();
    super.dispose();
  }

  Color _color(LogLevel level) => switch (level) {
        LogLevel.error => Colors.redAccent,
        LogLevel.warning => Colors.amberAccent,
        LogLevel.notify => Colors.lightBlueAccent,
        LogLevel.debug => Colors.white38,
        _ => Colors.white70,
      };

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            FBadge(
              label: Text(state.logStreaming ? 'Streaming' : 'Paused'),
            ),
            const SizedBox(width: 8),
            Text('${state.logs.length} lines',
                style: const TextStyle(fontSize: 12, color: Colors.white54)),
            const Spacer(),
            FButton.icon(
              style: FButtonStyle.ghost,
              onPress: state.logStreaming ? state.stopLogs : state.startLogs,
              child: Icon(
                state.logStreaming ? Icons.pause : Icons.play_arrow,
                size: 18,
              ),
            ),
            FButton.icon(
              style: FButtonStyle.ghost,
              onPress: state.clearLogs,
              child: const Icon(Icons.delete_outline, size: 18),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(8),
            ),
            child: state.logs.isEmpty
                ? const Text('Waiting for log output…',
                    style: TextStyle(color: Colors.white38, fontSize: 12))
                : ListView.builder(
                    controller: _scroll,
                    itemCount: state.logs.length,
                    itemBuilder: (context, i) {
                      final line = state.logs[i];
                      return Text(
                        line.message,
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: _color(line.level),
                        ),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}
