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
