import 'dart:convert';
import 'types.dart';

/// Defensive parsers — the Dart mirror of `packages/shared/src/parsers.ts`.
/// Each degrades gracefully when JSON is absent.

dynamic _tryJson(String text) {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return null;
  final start = trimmed.indexOf(RegExp(r'[\[{]'));
  if (start == -1) return null;
  try {
    return jsonDecode(trimmed.substring(start));
  } catch (_) {
    return null;
  }
}

num? _num(dynamic v) => v is num ? v : null;
String? _str(dynamic v) => v is String ? v : null;

SurgeStatus parseStatus(String stdout) {
  final json = _tryJson(stdout);
  if (json is Map) {
    return SurgeStatus(
      running: json['running'] == true || json['status'] == 'running',
      version: _str(json['version']),
      mode: _str(json['mode']) ?? _str(json['outboundMode']),
      uptimeSeconds: _num(json['uptime'])?.toInt() ?? _num(json['uptimeSeconds'])?.toInt(),
      outboundMode: _str(json['outboundMode']) ?? _str(json['mode']),
      activePolicy: _str(json['activePolicy']) ?? _str(json['policy']),
    );
  }
  final text = stdout.toLowerCase();
  final running = RegExp(r'running|active|started').hasMatch(text) &&
      !RegExp(r'not running|stopped').hasMatch(text);
  return SurgeStatus(running: running);
}

List<PolicyGroup> parsePolicies(String stdout) {
  final json = _tryJson(stdout);
  if (json is List) {
    return json.whereType<Map>().map((g) {
      final members = (g['members'] ?? g['all']);
      return PolicyGroup(
        name: _str(g['name']) ?? '',
        type: _str(g['type']) ?? 'select',
        selected: _str(g['selected']) ?? _str(g['now']),
        members: members is List ? members.map((m) => '$m').toList() : const [],
      );
    }).where((g) => g.name.isNotEmpty).toList();
  }
  return const [];
}

List<Rule> parseRules(String stdout) {
  final json = _tryJson(stdout);
  if (json is List) {
    return json.whereType<Map>().map((r) {
      return Rule(
        type: _str(r['type']) ?? '',
        value: _str(r['value']) ?? _str(r['pattern']) ?? '',
        policy: _str(r['policy']) ?? _str(r['target']) ?? '',
        hits: _num(r['hits'])?.toInt() ?? _num(r['count'])?.toInt(),
      );
    }).where((r) => r.type.isNotEmpty).toList();
  }
  // CSV fallback: "DOMAIN-SUFFIX,google.com,Proxy"
  final out = <Rule>[];
  for (final line in const LineSplitter().convert(stdout)) {
    final t = line.trim();
    if (t.isEmpty || t.startsWith('#')) continue;
    final parts = t.split(',').map((p) => p.trim()).toList();
    if (parts.length >= 3) {
      out.add(Rule(type: parts[0], value: parts[1], policy: parts[2]));
    } else if (parts.length == 2 && parts[0] == 'FINAL') {
      out.add(Rule(type: 'FINAL', value: '', policy: parts[1]));
    }
  }
  return out;
}

Traffic parseTraffic(String stdout) {
  final json = _tryJson(stdout);
  if (json is Map) {
    return Traffic(
      uploadBps: _num(json['uploadBps']) ?? _num(json['up']),
      downloadBps: _num(json['downloadBps']) ?? _num(json['down']),
      uploadTotal: _num(json['uploadTotal']) ?? _num(json['upTotal']),
      downloadTotal: _num(json['downloadTotal']) ?? _num(json['downTotal']),
      connections: _num(json['connections'])?.toInt() ?? _num(json['conns'])?.toInt(),
    );
  }
  return const Traffic();
}

const _levels = [
  LogLevel.debug,
  LogLevel.info,
  LogLevel.notify,
  LogLevel.warning,
  LogLevel.error,
];

LogLine parseLogLine(String line) {
  final lower = line.toLowerCase();
  final level = _levels.firstWhere(
    (l) => lower.contains('[${l.name}]') || lower.contains(' ${l.name} '),
    orElse: () => LogLevel.unknown,
  );
  final tsMatch = RegExp(r'^\[?(\d{4}-\d{2}-\d{2}[ T][\d:.]+)').firstMatch(line);
  final ts = tsMatch != null
      ? (DateTime.tryParse(tsMatch.group(1)!)?.millisecondsSinceEpoch ??
          DateTime.now().millisecondsSinceEpoch)
      : DateTime.now().millisecondsSinceEpoch;
  return LogLine(ts: ts, level: level, message: line);
}

String formatBps(num? bps) {
  if (bps == null || bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  var v = bps.toDouble();
  var i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  final digits = (v >= 100 || i == 0) ? 0 : 1;
  return '${v.toStringAsFixed(digits)} ${units[i]}';
}

String formatBytes(num? bytes) {
  if (bytes == null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var v = bytes.toDouble();
  var i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return '${v.toStringAsFixed(i == 0 ? 0 : 1)} ${units[i]}';
}
