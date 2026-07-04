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
  });

  final String townName;
  final String reportDate;
  final num income;
  final num expense;
  final List<Map<String, dynamic>> rows;

  num get cash => income - expense;
}
