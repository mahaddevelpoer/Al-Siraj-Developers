import 'package:flutter/material.dart';

enum ReviewKind { appeal, dailyEntry }

class ReviewItem {
  const ReviewItem({
    required this.id,
    required this.kind,
    required this.status,
    required this.title,
    required this.townName,
    required this.accountantName,
    required this.amount,
    required this.dateText,
    required this.summary,
    required this.raw,
  });

  final String id;
  final ReviewKind kind;
  final String status;
  final String title;
  final String townName;
  final String accountantName;
  final num amount;
  final String dateText;
  final String summary;
  final Map<String, dynamic> raw;

  bool get isPending => status == 'pending';
  IconData get icon =>
      kind == ReviewKind.dailyEntry ? Icons.receipt_long_rounded : Icons.rule_rounded;
}

class TownSummary {
  const TownSummary({
    required this.name,
    required this.received,
    required this.expenses,
    required this.pendingCollection,
    required this.pendingApprovals,
    required this.salesCount,
  });

  final String name;
  final num received;
  final num expenses;
  final num pendingCollection;
  final int pendingApprovals;
  final int salesCount;

  num get cash => received - expenses;
}

class DashboardSummary {
  const DashboardSummary({
    required this.towns,
    required this.pendingApprovals,
    required this.received,
    required this.expenses,
    required this.pendingCollection,
    required this.salesCount,
  });

  final List<TownSummary> towns;
  final int pendingApprovals;
  final num received;
  final num expenses;
  final num pendingCollection;
  final int salesCount;

  num get cash => received - expenses;
}

class LedgerReceiptSummary {
  const LedgerReceiptSummary({
    required this.townName,
    required this.reportDate,
    required this.income,
    required this.expense,
    required this.rows,
    this.mediaRows = const [],
  });

  final String townName;
  final String reportDate;
  final num income;
  final num expense;
  final List<Map<String, dynamic>> rows;
  final List<Map<String, dynamic>> mediaRows;

  num get cash => income - expense;
}

class OperatorPresence {
  const OperatorPresence({
    required this.name,
    required this.role,
    required this.townName,
    required this.online,
    required this.lastSeenText,
  });

  final String name;
  final String role;
  final String townName;
  final bool online;
  final String lastSeenText;
}

class TownDashboardDetail {
  const TownDashboardDetail({
    required this.summary,
    required this.recentApprovals,
    required this.receipt,
  });

  final TownSummary summary;
  final List<ReviewItem> recentApprovals;
  final LedgerReceiptSummary? receipt;
}

class AuditSchedule {
  const AuditSchedule({
    required this.id,
    required this.townName,
    required this.scheduledDate,
    required this.status,
  });

  final String id;
  final String townName;
  final String scheduledDate;
  final String status;
}

class LockerAudit {
  const LockerAudit({
    required this.id,
    required this.townName,
    required this.auditDate,
    required this.systemBalance,
    required this.physicalBalance,
    required this.discrepancy,
    required this.auditedBy,
    required this.report,
  });

  final String id;
  final String townName;
  final String auditDate;
  final num systemBalance;
  final num physicalBalance;
  final num discrepancy;
  final String auditedBy;
  final Map<String, dynamic> report;
}
