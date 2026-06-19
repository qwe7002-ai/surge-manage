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

/// Surge may wrap payloads as {result, error, <payload>}. Unwrap by key.
dynamic _unwrap(Map outer, String key) => outer.containsKey(key) ? outer[key] : outer;

/// Parse `ls -1` of the config dir into profile names (`*.conf`, sans extension).
List<String> parseProfiles(String stdout) {
  final out = stdout
      .split(RegExp(r'\r?\n'))
      .map((l) => l.trim())
      .where((l) => l.endsWith('.conf'))
      .map((l) => l.replaceFirst(RegExp(r'\.conf$'), ''))
      .toList()
    ..sort();
  return out;
}

/// Surface a Surge `error` field from a --raw response, if any.
String? extractError(String stdout) {
  final json = _tryJson(stdout);
  return json is Map ? _str(json['error']) : null;
}

Environment parseEnvironment(String stdout) {
  final json = _tryJson(stdout);
  final fields = <String, String>{};
  final selection = <String, String>{};
  final autoOverride = <String, String>{};
  String? globalPolicy;
  int? proxyMode;

  final env = json is Map ? _unwrap(json, 'environment') : null;
  if (env is Map) {
    env.forEach((k, v) {
      if (v == null) return;
      if (k == 'ProxyGroupSelection' && v is Map) {
        v.forEach((g, p) {
          final name = _str(p);
          if (name != null) selection['$g'] = name;
        });
        return;
      }
      if (k == 'AutoPolicyGroupOverride' && v is Map) {
        v.forEach((g, p) {
          final name = _str(p);
          if (name != null) autoOverride['$g'] = name;
        });
        return;
      }
      if (k == 'ProxyMode') {
        proxyMode = _num(v)?.toInt() ?? int.tryParse('$v');
      }
      if (k == 'AllProxyModePolicyNameKey') {
        globalPolicy = _str(v);
      }
      fields['$k'] = v is Map || v is List ? jsonEncode(v) : '$v';
    });
  }
  return Environment(
    fields: fields,
    selection: selection,
    autoOverride: autoOverride,
    globalPolicy: globalPolicy,
    proxyMode: proxyMode,
    raw: json ?? stdout,
  );
}

/// `surge --raw dump policy-group-sub-policies` → group → member names.
Map<String, List<String>> parseSubPolicies(String stdout) {
  final json = _tryJson(stdout);
  if (json is! Map) return {};
  final rec = _unwrap(json, 'policy-group-sub-policies');
  final map = rec is Map ? rec : json;
  final out = <String, List<String>>{};
  map.forEach((group, value) {
    if (value is List) {
      out['$group'] = _names(value);
    } else if (value is Map) {
      out['$group'] = _names(value['all'] ?? value['members'] ?? value['subPolicies']);
    }
  });
  return out;
}

String? _nameOf(dynamic v) {
  if (v is String) return v;
  if (v is Map) {
    return _str(v['name']) ?? _str(v['key']) ?? _str(v['url']) ?? _str(v['path']);
  }
  return null;
}

List<String> _names(dynamic v) => v is List
    ? v.map(_nameOf).whereType<String>().toList()
    : const [];

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

/// `surge --raw dump smart-group-info` → smart group names keyed by group.
Map<String, String> parseSmartGroupTypes(String stdout) {
  final json = _tryJson(stdout);
  if (json is! Map) return const {};
  final out = <String, String>{};
  json.forEach((name, value) {
    if (name == 'report') return;
    if (value is Map) out['$name'] = 'smart';
  });
  return out;
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

/// Parse one classic comma-separated rule line into a Rule.
///   "DOMAIN-SUFFIX,google.com,Proxy" → matcher rule (type,value,policy)
///   "FINAL,Proxy" / "FINAL,Proxy,dns-failed" → FINAL rule (no value)
Rule? _parseRuleLine(String line) {
  final parts = line.split(',').map((p) => p.trim()).toList();
  if (parts.isEmpty) return null;
  final type = parts[0];
  if (type.isEmpty) return null;
  // FINAL has no matcher value: the second token is the policy itself.
  if (type == 'FINAL') {
    return parts.length >= 2 ? Rule(type: type, value: '', policy: parts[1]) : null;
  }
  if (parts.length < 3) return null;
  return Rule(type: type, value: parts[1], policy: parts[2]);
}

/// `surge --raw dump rule` → {"rules":["DOMAIN-SUFFIX,google.com,Proxy", ...]}
/// (each entry is a rule string). Tolerant of a bare array, an array of
/// {type,value,policy} objects, or plain newline-delimited text.
List<Rule> parseRules(String stdout) {
  final json = _tryJson(stdout);
  final arr = json is List
      ? json
      : (json is Map && json['rules'] is List)
          ? json['rules'] as List
          : null;
  if (arr != null) {
    final out = <Rule>[];
    for (final item in arr) {
      if (item is String) {
        final r = _parseRuleLine(item);
        if (r != null) out.add(r);
      } else if (item is Map) {
        final type = _str(item['type']) ?? '';
        if (type.isEmpty) continue;
        out.add(Rule(
          type: type,
          value: _str(item['value']) ?? _str(item['pattern']) ?? '',
          policy: _str(item['policy']) ?? _str(item['target']) ?? '',
          hits: _num(item['hits'])?.toInt() ?? _num(item['count'])?.toInt(),
        ));
      }
    }
    return out;
  }
  // Fallback: classic comma-separated rule lines, one per line.
  final out = <Rule>[];
  for (final line in const LineSplitter().convert(stdout)) {
    final t = line.trim();
    if (t.isEmpty || t.startsWith('#')) continue;
    final r = _parseRuleLine(t);
    if (r != null) out.add(r);
  }
  return out;
}

/// `surge --raw dump temp-rule` → raw rule strings (what del-temp-rule expects).
List<String> parseTempRules(String stdout) {
  final json = _tryJson(stdout);
  final arr = json is List
      ? json
      : (json is Map && json['temp-rule'] is List)
          ? json['temp-rule'] as List
          : null;
  if (arr != null) {
    return arr
        .map((item) {
          if (item is String) return item;
          if (item is Map) {
            return [
              _str(item['type']),
              _str(item['value']) ?? _str(item['pattern']),
              _str(item['policy']),
            ].whereType<String>().join(',');
          }
          return '';
        })
        .where((s) => s.isNotEmpty)
        .toList();
  }
  return stdout
      .split(RegExp(r'\r?\n'))
      .map((l) => l.trim())
      .where((l) => l.isNotEmpty && !l.startsWith('#'))
      .toList();
}

/// `surge --raw external-resource list`.
List<ExternalResource> parseExternalResources(String stdout) {
  final json = _tryJson(stdout);
  final list = json is List
      ? json
      : (json is Map && json['resources'] is List)
          ? json['resources'] as List
          : const [];
  return list.whereType<Map>().map((r) {
    return ExternalResource(
      key: _str(r['key']) ?? _str(r['hash']) ?? _str(r['url']) ?? '',
      url: _str(r['url']),
      ready: r['ready'] is bool ? r['ready'] as bool : null,
      updatedAt: _num(r['updatedAt'])?.toInt() ?? _num(r['updated'])?.toInt(),
    );
  }).where((r) => r.key.isNotEmpty).toList();
}

/// Coerce a string-or-number id into a string (Surge uses numeric ids).
String? _idStr(dynamic v) {
  if (v is num) return '$v';
  return _str(v);
}

/// `surge --raw dump active` → list of active connections. Surge returns the
/// active requests under a `requests` envelope (`{"requests":[...]}`); older/
/// forked shapes use `connections` or a bare array — all are accepted.
List<ActiveConnection> parseActive(String stdout) {
  final json = _tryJson(stdout);
  final list = json is List
      ? json
      : (json is Map && json['requests'] is List)
          ? json['requests'] as List
          : (json is Map && json['connections'] is List)
              ? json['connections'] as List
              : const [];
  var i = 0;
  return list.whereType<Map>().map((c) {
    final conn = ActiveConnection(
      // Surge request ids are numbers; keep them as strings for `kill <id>`.
      id: _idStr(c['id']) ?? _idStr(c['connectionId']) ?? '$i',
      remote: _str(c['remoteAddress']) ??
          _str(c['remote']) ??
          _str(c['host']) ??
          _str(c['URL']) ??
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
