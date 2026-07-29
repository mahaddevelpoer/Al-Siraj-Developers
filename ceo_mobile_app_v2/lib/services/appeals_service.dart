import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../rebuilt/models.dart';
import '../rebuilt/utils.dart';

/// New Appeals Service — Clean, Direct, No Layers
/// Bypasses complex normalization logic that was dropping data.
class AppealsService {
  AppealsService(this.supabase);

  final SupabaseClient supabase;

  /// Load appeals by status.
  /// Simple mapping logic. No caching. Direct from Supabase.
  Future<List<ReviewItem>> loadAppeals(String status, {int limit = 60}) async {
    final queryStatus = normalizeStatus(status);
    
    print('[APPEALS-SERVICE] Loading appeals for status: $status');

    try {
      // EXACT same query pattern as inbox_repository.dart (PROVEN WORKING)
      final response = await supabase
          .from('appeals')
          .select(
            'id,appeal_type,status,created_at,town_name,reason,requested_data,requested_by_user_id(full_name,email,town_name)',
          )
          .eq('status', queryStatus)
          .order('created_at', ascending: false)
          .limit(limit)
          .timeout(const Duration(seconds: 10));

      print('[APPEALS-SERVICE] Query returned: type=${response.runtimeType}');
      
      if (response is! List) {
        print('[APPEALS-SERVICE] ERROR: Expected List but got ${response.runtimeType}');
        return [];
      }

      print('[APPEALS-SERVICE] Got ${response.length} raw rows');
      
      if (response.isEmpty) {
        return [];
      }

      // Simple loop to map rows -> ReviewItems
      // No complex filtering or secondary normalization
      final items = <ReviewItem>[];
      for (final row in response) {
        if (row is! Map<String, dynamic>) continue;

        try {
          final item = _mapRowToItem(row);
          if (item != null) items.add(item);
        } catch (e) {
          print('[APPEALS-SERVICE] Error mapping row: $e');
        }
      }

      print('[APPEALS-SERVICE] Returning ${items.length} items');
      return items;

    } catch (e, stack) {
      print('[APPEALS-SERVICE] Failed: $e');
      return [];
    }
  }

  /// Direct mapping function. If it fails here, we'll know exactly why.
  ReviewItem? _mapRowToItem(Map<String, dynamic> row) {
    final id = row['id']?.toString();
    if (id == null || id.isEmpty) return null;

    final status = normalizeStatus(row['status']);
    final appealType = row['appeal_type']?.toString() ?? 'unknown';
    final townName = row['town_name']?.toString() ?? 'No town';
    final createdAt = row['created_at']?.toString() ?? '';

    // Parse requested_data for richer information on the card
    Map<String, dynamic> rd = {};
    final rawRd = row['requested_data'];
    if (rawRd is Map<String, dynamic>) {
      rd = rawRd;
    } else if (rawRd is String && rawRd.isNotEmpty && rawRd != 'null') {
      try {
        final decoded = jsonDecode(rawRd);
        if (decoded is Map<String, dynamic>) rd = decoded;
      } catch (_) {}
    }

    // Derive amount from requested_data
    final amountRaw = rd['amount'] ?? rd['Amount'] ?? rd['proposedSalary'] ?? 0;
    final amount = double.tryParse(amountRaw.toString()) ?? 0.0;

    // Derive summary: prefer description/category from requested_data, else reason
    final reason = row['reason']?.toString() ?? '';
    final rdDesc = rd['description']?.toString() ?? rd['Description']?.toString() ?? '';
    final rdCat = rd['category']?.toString() ?? rd['Category']?.toString() ?? '';
    final rdType = rd['type']?.toString() ?? rd['Type']?.toString() ?? '';
    final rdDate = rd['date']?.toString() ?? rd['Date']?.toString() ?? '';
    final summary = rdDesc.isNotEmpty
        ? rdDesc
        : rdCat.isNotEmpty
            ? rdCat
            : reason.isNotEmpty
                ? reason
                : 'No details';

    // Build more descriptive title for daily entry appeals
    String title;
    if (appealType == 'backdated_daily_entry' || appealType == 'future_daily_entry') {
      final typeLabel = rdType.isNotEmpty ? rdType : 'Entry';
      final dateLabel = rdDate.isNotEmpty ? ' ($rdDate)' : '';
      title = 'Daily $typeLabel$dateLabel';
    } else {
      title = 'Appeal: ${appealType.replaceAll('_', ' ').capitalize()}';
    }

    // Safe user parsing
    String accountantName = 'Accountant';
    final userData = row['requested_by_user_id'];
    if (userData is Map<String, dynamic>) {
      accountantName = userData['full_name']?.toString()
          ?? userData['email']?.toString()
          ?? 'Accountant';
    }

    return ReviewItem(
      id: id,
      kind: ReviewKind.appeal,
      status: status,
      title: title,
      townName: townName,
      accountantName: accountantName,
      amount: amount,
      dateText: rdDate.isNotEmpty ? rdDate : formatAnyDate(createdAt),
      summary: summary,
      raw: row,
    );
  }

  /// Approve/Reject wrapper — calls ceo_review_appeal RPC with direct update fallback
  Future<void> reviewAppeal(String appealId, String newStatus) async {
    try {
      await supabase.rpc(
        'ceo_review_appeal',
        params: {'appeal_id': appealId, 'new_status': newStatus},
      ).timeout(const Duration(seconds: 12));
    } catch (e) {
      // Fallback: direct status update so the accountant gets the realtime signal
      await supabase
          .from('appeals')
          .update({
            'status': newStatus,
            'reviewed_at': DateTime.now().toIso8601String(),
          })
          .eq('id', appealId)
          .timeout(const Duration(seconds: 10));
    }
  }

}

extension StringExtension on String {
  String capitalize() {
    if (isEmpty) return this;
    return '${this[0].toUpperCase()}${substring(1)}';
  }
}
