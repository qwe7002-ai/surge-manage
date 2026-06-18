import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'types.dart';

/// Persists host definitions and secrets using the platform secure storage
/// (Keychain on iOS, EncryptedSharedPreferences/Keystore on Android).
///
/// Host metadata is stored as JSON under one key; secrets (passwords,
/// passphrases) are stored under `secret:<ref>` so they never sit in the
/// metadata blob.
class SecureStore {
  SecureStore._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _hostsKey = 'surge_manage.hosts';

  static Future<List<HostConfig>> listHosts() async {
    final raw = await _storage.read(key: _hostsKey);
    if (raw == null || raw.isEmpty) return [];
    final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
    return list.map(HostConfig.fromJson).toList();
  }

  static Future<void> saveHost(HostConfig host) async {
    final hosts = await listHosts();
    final idx = hosts.indexWhere((h) => h.id == host.id);
    if (idx >= 0) {
      hosts[idx] = host;
    } else {
      hosts.add(host);
    }
    await _writeHosts(hosts);
  }

  static Future<void> removeHost(String id) async {
    final hosts = await listHosts()
      ..removeWhere((h) => h.id == id);
    await _writeHosts(hosts);
  }

  static Future<void> _writeHosts(List<HostConfig> hosts) async {
    final json = jsonEncode(hosts.map((h) => h.toJson()).toList());
    await _storage.write(key: _hostsKey, value: json);
  }

  static Future<void> setSecret(String ref, String value) =>
      _storage.write(key: 'secret:$ref', value: value);

  static Future<String?> getSecret(String ref) =>
      _storage.read(key: 'secret:$ref');

  static Future<void> deleteSecret(String ref) =>
      _storage.delete(key: 'secret:$ref');
}
