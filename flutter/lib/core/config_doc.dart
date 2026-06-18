/// Minimal, lossless model of a Surge profile config for structured editing.
/// Dart mirror of `packages/shared/src/config-doc.ts`.
///
/// The file is parsed into ordered sections (`[Name]` headers plus a leading
/// preamble with `name == null`). Each section keeps its raw lines verbatim, so
/// untouched sections — `[General]`, comments, blanks — survive a round-trip.
class ConfigSection {
  ConfigSection({required this.name, required this.lines});

  /// Section header name (e.g. "Proxy"), or null for the leading preamble.
  final String? name;

  /// Raw lines belonging to this section (header line excluded).
  List<String> lines;
}

final _headerRe = RegExp(r'^\s*\[(.+)\]\s*$');

List<ConfigSection> parseConfigDocument(String text) {
  final sections = <ConfigSection>[];
  var current = ConfigSection(name: null, lines: []);
  sections.add(current);
  for (final raw in text.split(RegExp(r'\r?\n'))) {
    final m = _headerRe.firstMatch(raw);
    if (m != null) {
      current = ConfigSection(name: m.group(1)!.trim(), lines: []);
      sections.add(current);
    } else {
      current.lines.add(raw);
    }
  }
  return sections;
}

String serializeConfigDocument(List<ConfigSection> sections) {
  final parts = <String>[];
  for (final s in sections) {
    if (s.name != null) parts.add('[${s.name}]');
    parts.addAll(s.lines);
  }
  return parts.join('\n');
}

bool _isEntry(String line) {
  final t = line.trim();
  return t.isNotEmpty &&
      !t.startsWith('#') &&
      !t.startsWith('//') &&
      !t.startsWith(';');
}

/// The trimmed, non-comment entry lines of the first section matching [name].
List<String> getSectionEntries(List<ConfigSection> sections, String name) {
  final lower = name.toLowerCase();
  for (final s in sections) {
    if (s.name?.toLowerCase() == lower) {
      return s.lines.where(_isEntry).map((l) => l.trim()).toList();
    }
  }
  return const [];
}

/// Return a copy of [sections] with the named section's content replaced by
/// [entries]. The section is appended when absent. In-section comments are not
/// preserved — structured editing replaces the whole section body.
List<ConfigSection> setSectionEntries(
  List<ConfigSection> sections,
  String name,
  List<String> entries,
) {
  final lower = name.toLowerCase();
  final next = sections
      .map((s) => ConfigSection(name: s.name, lines: [...s.lines]))
      .toList();
  for (final s in next) {
    if (s.name?.toLowerCase() == lower) {
      s.lines = [...entries];
      return next;
    }
  }
  next.add(ConfigSection(name: name, lines: [...entries]));
  return next;
}

/// A single line of a Surge `[Rule]` section. A `#`-prefixed line that still
/// looks like a rule is a *disabled* rule (toggleable); one that does not is a
/// plain *comment* (shown read-only, never toggled into a rule).
class RuleEntry {
  RuleEntry({required this.text, required this.enabled, required this.comment});

  /// Rule / comment text with any leading comment marker stripped.
  final String text;

  /// For rules: active vs disabled. Always false for comments.
  final bool enabled;

  /// True when the line is a plain comment rather than a (disabled) rule.
  final bool comment;

  RuleEntry copyWith({String? text, bool? enabled, bool? comment}) => RuleEntry(
        text: text ?? this.text,
        enabled: enabled ?? this.enabled,
        comment: comment ?? this.comment,
      );
}

final _ruleCommentRe = RegExp(r'^(?:#+|//|;)\s?');

/// A commented line "looks like a rule" when its first comma-separated token is
/// an all-caps rule type (`DOMAIN-SUFFIX`, `IP-CIDR`, `FINAL`, `AND`, …).
final _ruleLikeRe = RegExp(r'^[A-Z][A-Z0-9-]*,');

/// Read a `[Rule]`-style section preserving order. Unlike [getSectionEntries],
/// commented lines are kept: rule-like ones as disabled rules, the rest as
/// plain comments.
List<RuleEntry> getRuleEntries(List<ConfigSection> sections, String name) {
  final lower = name.toLowerCase();
  for (final s in sections) {
    if (s.name?.toLowerCase() == lower) {
      final out = <RuleEntry>[];
      for (final raw in s.lines) {
        final t = raw.trim();
        if (t.isEmpty) continue;
        final m = _ruleCommentRe.firstMatch(t);
        if (m != null) {
          final text = t.substring(m.end).trim();
          if (text.isEmpty) continue;
          out.add(RuleEntry(
              text: text, enabled: false, comment: !_ruleLikeRe.hasMatch(text)));
        } else {
          out.add(RuleEntry(text: t, enabled: true, comment: false));
        }
      }
      return out;
    }
  }
  return const [];
}

/// Replace a `[Rule]`-style section from [RuleEntry] values. Disabled rules and
/// comments are written back with a `# ` prefix so they survive the round-trip;
/// only active rules are emitted bare.
List<ConfigSection> setRuleEntries(
  List<ConfigSection> sections,
  String name,
  List<RuleEntry> entries,
) {
  final lines = entries
      .map((e) => e.copyWith(text: e.text.trim()))
      .where((e) => e.text.isNotEmpty)
      .map((e) => e.enabled && !e.comment ? e.text : '# ${e.text}')
      .toList();
  return setSectionEntries(sections, name, lines);
}
