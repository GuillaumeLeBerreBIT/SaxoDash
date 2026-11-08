from .models import InvestorFollow


def followed_ids(user):
    return set(InvestorFollow.objects.filter(user=user).values_list('investor_id', flat=True))


def set_followed(user, investor, followed):
    if followed:
        InvestorFollow.objects.get_or_create(user=user, investor=investor)
    else:
        InvestorFollow.objects.filter(user=user, investor=investor).delete()


def followed_by_someone_else(investor, user):
    return InvestorFollow.objects.filter(investor=investor).exclude(user=user).exists()
