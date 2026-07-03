import 'dart:convert';

enum ReviewItemKind { appeal, dailyEntry }

Map<String, dynamic> safeMapFromAny(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List && value.isNotEmpty) return safeMapFromAny(value.first);
  if (value is String && value.trim().isNotEmpty) {
    try {
      return safeMapFromAny(jsonDecode(value));
    } catch (_) {
      return const {};
    }
  }
  return const {};
}

dynamic safeRowValue(Map<String, dynamic> row, String key) {
  final lower = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
  return row[key] ?? row[lower];
}

String reviewKindOf(Map<String, dynamic> row) {
  return '${row['_review_kind'] ?? ReviewItemKind.appeal.name}';
}

bool isDailyReviewItem(Map<String, dynamic> row) {
  return reviewKindOf(row) == ReviewItemKind.dailyEntry.name;
}

Map<String, dynamic> normalizeAppealReviewRow(Map<String, dynamic> row) {
  return {
    ...row,
    '_review_kind': ReviewItemKind.appeal.name,
  };
}

Map<String, dynamic> normalizeDailyEntryReviewRow(Map<String, dynamic> row) {
  return {
    ...row,
    '_review_kind': ReviewItemKind.dailyEntry.name,
    'status': row['review_status'] ?? safeRowValue(row, 'Review_Status') ?? 'pending',
    'appeal_type': 'daily_entry_review',
    'requested_data': {
      'town_name': safeRowValue(row, 'Town_Name') ?? row['town_name'],
      'type': safeRowValue(row, 'Type') ?? row['type'],
      'category': safeRowValue(row, 'Category') ?? row['category'],
      'amount': safeRowValue(row, 'Amount') ?? row['amount'],
      'date': safeRowValue(row, 'Date') ?? row['date'],
      'description': safeRowValue(row, 'Description') ?? row['description'],
    },
  };
}
