import 'dart:convert';

import 'package:intl/intl.dart';

final money = NumberFormat.currency(locale: 'en_PK', symbol: 'PKR ', decimalDigits: 0);
final shortDate = DateFormat('yyyy-MM-dd');

dynamic rowValue(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
  return row[key] ?? row[lower];
}

Map<String, dynamic> mapFromAny(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty) return mapFromAny(value.first);
  if (value is String && value.trim().isNotEmpty) {
    try {
      return mapFromAny(jsonDecode(value));
    } catch (_) {
      return const {};
    }
  }
  return const {};
}

num asNum(dynamic value) {
  if (value is num) return value;
  return num.tryParse('$value'.replaceAll(',', '').trim()) ?? 0;
}

String textOf(dynamic value, [String fallback = '']) {
  final text = '${value ?? ''}'.trim();
  if (text.isEmpty || text.toLowerCase() == 'null') return fallback;
  return text;
}

String normalizeStatus(dynamic value) {
  final text = textOf(value, 'pending').toLowerCase();
  if (text == 'approved' || text == 'rejected') return text;
  return 'pending';
}

String pretty(dynamic value) => textOf(value, 'Unknown').replaceAll('_', ' ');

String formatAnyDate(dynamic value) {
  final text = textOf(value);
  final parsed = DateTime.tryParse(text);
  return parsed == null ? text : shortDate.format(parsed.toLocal());
}

String friendlyError(Object error) {
  final raw = '$error';
  if (raw.toLowerCase().contains('schema cache') || raw.contains('PGRST204')) {
    return 'Supabase schema cache issue. Run SQL repair/performance support once.';
  }
  if (raw.toLowerCase().contains('row-level security')) {
    return 'Supabase RLS blocked this action. Check CEO/accountant policies.';
  }
  return raw.replaceAll('PostgrestException(message: ', '').replaceAll(RegExp(r'\)$'), '');
}
