from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from users.owner import is_owner

User = get_user_model()
USERNAME_FIELD = User._meta.get_field('username')

GENERIC_REFUSAL = 'We could not create that account. Check the details and try again.'


def username_taken(username, exclude=None):
    users = User.objects.filter(username__iexact=username)
    return users.exclude(pk=exclude.pk).exists() if exclude else users.exists()


def email_taken(email, exclude=None):
    users = User.objects.filter(email__iexact=email)
    return users.exclude(pk=exclude.pk).exists() if exclude else users.exists()


class LoginSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        'no_active_account': 'No account matches that login and password.'
    }


class UserSerializer(serializers.ModelSerializer):
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['username', 'email', 'is_owner']

    def get_is_owner(self, user):
        return is_owner(user)


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField(
        max_length=USERNAME_FIELD.max_length, validators=USERNAME_FIELD.validators
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    website = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()
        if email_taken(value):
            raise serializers.ValidationError('That email is already registered.')
        return value

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('This field may not be blank.')
        if username_taken(value):
            raise serializers.ValidationError('That username is taken.')
        return value

    def validate(self, attrs):
        if attrs.get('website'):
            raise serializers.ValidationError(GENERIC_REFUSAL)
        candidate = User(username=attrs['username'], email=attrs['email'])
        try:
            validate_password(attrs['password'], candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(
            validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )


class AccountChangeSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=USERNAME_FIELD.max_length,
        validators=USERNAME_FIELD.validators,
        required=False,
    )
    email = serializers.EmailField(required=False)
    current_password = serializers.CharField(
        required=False, write_only=True, trim_whitespace=False
    )

    def validate_username(self, value):
        value = value.strip()
        user = self.context['request'].user
        if username_taken(value, exclude=user):
            raise serializers.ValidationError('That username is taken.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        user = self.context['request'].user
        if email_taken(value, exclude=user):
            raise serializers.ValidationError('That email is already registered.')
        return value

    def validate(self, attrs):
        if 'email' in attrs:
            user = self.context['request'].user
            password = attrs.get('current_password', '')
            if not password or not user.check_password(password):
                raise serializers.ValidationError(
                    {'current_password': ['Enter your current password to change your email.']}
                )
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('That is not your current password.')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context['request'].user)
        return value
