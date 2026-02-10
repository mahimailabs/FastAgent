"""Auth router for webhook handling."""

import logging
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

from src.core.config import config
from src.core.container import Container as DIContainer
from src.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


@router.post("/webhook")
@inject
async def clerk_webhook(
    request: Request,
    svix_id: Annotated[str, Header(alias="svix-id")],
    svix_timestamp: Annotated[str, Header(alias="svix-timestamp")],
    svix_signature: Annotated[str, Header(alias="svix-signature")],
    user_service: UserService = Depends(Provide[DIContainer.user_service]),
):
    """
    Handle Clerk webhooks for user lifecycle events.
    Verifies the webhook signature using Svix and syncs the user to the database.
    """
    webhook_secret = config.CLERK_WEBHOOK_SECRET_VALUE
    if not webhook_secret:
        logger.warning("CLERK_WEBHOOK_SECRET is not set, ignoring webhook")
        return {"status": "ignored", "reason": "secret_not_set"}

    # Get the request body as bytes
    payload = await request.body()
    headers = {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
    }

    # Verify the signature
    try:
        wh = Webhook(webhook_secret)
        evt = wh.verify(payload, headers)
    except WebhookVerificationError as e:
        logger.error(f"Webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle the event
    event_type = evt.get("type")
    data = evt.get("data")

    logger.info(f"Received Clerk webhook: {event_type}")

    if event_type in ["user.created", "user.updated"]:
        user_id = data.get("id")
        email_addresses = data.get("email_addresses", [])
        primary_email_id = data.get("primary_email_address_id")

        # Find primary email
        email = None
        for email_record in email_addresses:
            if email_record.get("id") == primary_email_id:
                email = email_record.get("email_address")
                break

        if not email and email_addresses:
            # Fallback to first email if primary not found
            email = email_addresses[0].get("email_address")

        # Extract name
        first_name = data.get("first_name", "")
        last_name = data.get("last_name", "")
        name = f"{first_name} {last_name}".strip() or None

        if user_id:
            await user_service.sync_clerk_user(clerk_id=user_id, email=email, name=name)
            logger.info(f"Synced user {user_id} ({email}) from webhook")

    elif event_type == "user.deleted":
        user_id = data.get("id")
        if user_id:
            await user_service.delete_clerk_user(user_id)
            logger.info(f"Deleted user {user_id} from webhook")

    return {"status": "ok", "event": event_type}
