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
    final reason = row['reason']?.toString() ?? 'No details';

    // Safe user parsing
    String accountantName = 'Accountant';
    final userData = row['requested_by_user_id'];
    if (userData is Map<String, dynamic>) {
      accountantName = userData['full_name']?.toString() 
          ?? userData['email']?.toString() 
          ?? 'Accountant';
    }

    // Build title
    final title = 'Appeal: ${appealType.replaceAll('_', ' ').capitalize()}';

    return ReviewItem(
      id: id,
      kind: ReviewKind.appeal,
      status: status,
      title: title,
      townName: townName,
      accountantName: accountantName,
      amount: 0,
      dateText: formatAnyDate(createdAt),
      summary: reason,
      raw: row,
    );
  }

  /// Approve/Reject wrapper
  Future<void> reviewAppeal(String appealId, String newStatus) async {
    await supabase.rpc(
      'ceo_review_appeal',
      params: {'appeal_id': appealId, 'new_status': newStatus},
    );
  }
}

extension StringExtension on String {
  String capitalize() {
    if (isEmpty) return this;
    return '${this[0].toUpperCase()}${substring(1)}';
  }
}
