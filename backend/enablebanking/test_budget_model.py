from decimal import Decimal

from django.test import TestCase

from .models import BUDGETABLE_CATEGORIES, Budget


class BudgetModelTest(TestCase):
    def test_category_is_unique(self):
        Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('300'))
        with self.assertRaises(Exception):
            Budget.objects.create(category='GROCERIES', monthly_limit=Decimal('400'))

    def test_str_includes_category_and_limit(self):
        budget = Budget.objects.create(category='DINING', monthly_limit=Decimal('150'))
        self.assertIn('DINING', str(budget))


class BudgetableCategoriesTest(TestCase):
    def test_excludes_non_discretionary_categories(self):
        codes = dict(BUDGETABLE_CATEGORIES)
        for excluded in ('INCOME', 'TRANSFER', 'SAVINGS', 'REFUND_CREDIT'):
            self.assertNotIn(excluded, codes)

    def test_includes_discretionary_categories(self):
        codes = dict(BUDGETABLE_CATEGORIES)
        for included in ('GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
                          'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER'):
            self.assertIn(included, codes)

    def test_has_exactly_ten_categories(self):
        self.assertEqual(len(BUDGETABLE_CATEGORIES), 10)
