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

Environment parseEnvironment(String stdout) {
  final json = _tryJson(stdout);
  final fields = <String, String>{};
  if (json is Map) {
    json.forEach((k, v) {
      if (v == null) return;
      fields['$k'] = v is Map || v is List ? jsonEncode(v) : '$v';
    });
  }
  return Environment(fields: fields, raw: json ?? stdout);
}

List<String> _names(dynamic v) =>
    v is List ? v.map((m) => '$m').toList() : const [];

/// `surge --raw dump policy` → {"proxies":[...],"policy-groups":[...]}
PolicyDump parsePolicies(String stdout) {
  final json = _tryJson(stdout);
  if (json is Map) {
    return PolicyDump(
      proxies: _names(json['proxies']),
      groups: _names(json['policy-groups'] ?? json['policyGroups'] ?? json['groups']),
    );
  }
  return const PolicyDump();
}

/// `surge --raw test-all-policies` → {"UK":{"tcp":66,"receive":415,...}, ...}
List<PolicyTest> parsePolicyTests(String stdout) {
  final json = _tryJson(stdout);
  if (json is! Map) return const [];
  final out = <PolicyTest>[];
  json.forEach((name, value) {
    if (value is! Map) return;
    out.add(PolicyTest(
      name: '$name',
      tcpMs: _num(value['tcp'])?.toInt(),
      receiveMs: _num(value['receive'])?.toInt(),
      available: _num(value['available'])?.toInt(),
      roundOneTotal: _num(value['round-one-total'])?.toInt(),
      error: _str(value['error']),
    ));
  });
  return out;
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

/// `surge --raw dump active` → list of active connections.
List<ActiveConnection> parseActive(String stdout) {
  final json = _tryJson(stdout);
  final list = json is List
      ? json
      : (json is Map && json['connections'] is List)
          ? json['connections'] as List
          : const [];
  var i = 0;
  return list.whereType<Map>().map((c) {
    final conn = ActiveConnection(
      id: _str(c['id']) ?? _str(c['connectionId']) ?? '${i}',
      remote: _str(c['remoteAddress']) ??
          _str(c['remote']) ??
          _str(c['host']) ??
          _str(c['url']) ??
          '—',
      policy: _str(c['policyName']) ?? _str(c['policy']) ?? _str(c['proxy']),
      rule: _str(c['rule']),
      uploadBytes: _num(c['outBytes']) ?? _num(c['uploadBytes']) ?? _num(c['upload']),
      downloadBytes: _num(c['inBytes']) ?? _num(c['downloadBytes']) ?? _num(c['download']),
    );
    i++;
    return conn;
  }).toList();
}

/// Aggregate `dump active` connections into dashboard totals.
Traffic aggregateTraffic(List<ActiveConnection> connections) {
  num up = 0;
  num down = 0;
  for (final c in connections) {
    up += c.uploadBytes ?? 0;
    down += c.downloadBytes ?? 0;
  }
  return Traffic(
    connections: connections.length,
    uploadTotal: up == 0 ? null : up,
    downloadTotal: down == 0 ? null : down,
  );
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
