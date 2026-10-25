import json
import math

from rest_framework import serializers

from .models import Recommendation

MAX_THESIS = 4000
MAX_LINE = 500
MAX_ITEMS = 10
MIN_RISKS = 3
MAX_FIGURES_JSON = 4000
TARGET_REQUIRED = ('buy_new', 'add')


def _choice(field):
    allowed = [choice for choice, _ in Recommendation._meta.get_field(field).choices]
    message = f'Unknown {field} {{input!r}}; use one of: {", ".join(sorted(allowed))}.'
    return serializers.ChoiceField(choices=allowed, error_messages={'invalid_choice': message})


class Text(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


def _lines(**options):
    return serializers.ListField(child=Text(max_length=MAX_LINE), max_length=MAX_ITEMS, **options)


class PositivePrice(serializers.FloatField):
    def to_internal_value(self, data):
        if isinstance(data, bool):
            self.fail('invalid')
        value = super().to_internal_value(data)
        if not math.isfinite(value) or value <= 0:
            raise serializers.ValidationError('Must be a positive, finite number.')
        return value


class InvalidationInput(serializers.Serializer):
    price = PositivePrice(required=False, allow_null=True)
    conditions = _lines(required=False, default=list)

    def validate(self, attrs):
        if attrs.get('price') is None and not attrs.get('conditions'):
            raise serializers.ValidationError('An invalidation needs a price or conditions.')
        return attrs


class TargetInput(serializers.Serializer):
    price = PositivePrice()
    condition = Text(max_length=MAX_LINE, required=False, allow_blank=True)


class RangeInput(serializers.Serializer):
    low = PositivePrice()
    high = PositivePrice()

    def validate(self, attrs):
        if attrs['low'] > attrs['high']:
            raise serializers.ValidationError('low must not be above high.')
        return attrs


class RecommendationInput(serializers.Serializer):
    action = _choice('action')
    horizon = _choice('horizon')
    conviction = _choice('conviction')
    thesis = Text(max_length=MAX_THESIS)
    bear_case = _lines(min_length=MIN_RISKS)
    invalidation = InvalidationInput()
    target = TargetInput(required=False, allow_null=True, default=None)
    buy_range = RangeInput(required=False, allow_null=True, default=None)
    sell_range = RangeInput(required=False, allow_null=True, default=None)
    figures = serializers.JSONField(required=False, default=dict)
    lenses = _lines(required=False, default=list)
    zone = Text(max_length=20, required=False, allow_blank=True, default='')
    review = serializers.BooleanField(required=False, default=False)
    uncertainties = _lines(required=False, default=list)

    def validate_figures(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Must be an object.')
        try:
            encoded = json.dumps(value, allow_nan=False)
        except ValueError as exc:
            raise serializers.ValidationError('Numbers must be finite.') from exc
        if len(encoded) > MAX_FIGURES_JSON:
            raise serializers.ValidationError(f'Must be at most {MAX_FIGURES_JSON} characters as JSON.')
        return value

    def validate(self, attrs):
        if attrs['action'] in TARGET_REQUIRED and not attrs.get('target'):
            raise serializers.ValidationError({'target': f"A {attrs['action']} needs a target."})
        return attrs


def _flattened(errors, prefix=''):
    if isinstance(errors, dict):
        for name, value in errors.items():
            label = prefix if name == 'non_field_errors' else f'{prefix}{name}'
            yield from _flattened(value, f'{label}.' if label else '')
    elif isinstance(errors, list):
        for value in errors:
            yield from _flattened(value, prefix)
    else:
        yield f'{prefix.rstrip(".")}: {errors}' if prefix else str(errors)


def problems(errors):
    return '; '.join(_flattened(errors))
