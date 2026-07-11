import 'package:ceo_mobile_app/rebuilt/app.dart';
import 'package:ceo_mobile_app/rebuilt/constants.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  setUpAll(() async {
    await Supabase.initialize(url: supabaseUrl, publishableKey: _testAnonKey);
  });

  testWidgets('shows CEO login screen', (tester) async {
    await tester.pumpWidget(const RebuiltCeoApp());
    await tester.pump();

    expect(find.text('AL SIRAJ DEVELOPERS'), findsOneWidget);
    expect(find.text('Enter CEO App'), findsOneWidget);
  });
}

const _testAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkaXNsYmRmdG53bWFleHF0Zm1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODY0MzksImV4cCI6MjA4NTE2MjQzOX0.hSUYRs4scWmUNZGK0slHeX9t--Of5CZclAhoCRbcXmc';
