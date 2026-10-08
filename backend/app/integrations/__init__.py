from app.integrations.base import PublishAdapter


def get_adapter(platform: str) -> PublishAdapter:
    from app.integrations.facebook.adapter import FacebookAdapter
    from app.integrations.instagram.adapter import InstagramAdapter
    from app.integrations.linkedin.adapter import LinkedInAdapter
    from app.integrations.mock.adapter import MockAdapter
    from app.integrations.whatsapp.adapter import WhatsAppAdapter

    adapters = {"instagram": InstagramAdapter, "facebook": FacebookAdapter, "whatsapp": WhatsAppAdapter,
                "linkedin": LinkedInAdapter, "mock": MockAdapter}
    return adapters[platform]()
