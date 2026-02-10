"""Clerk JWT authentication module with JWKS-based token verification."""

import logging
from datetime import datetime, timedelta
from typing import Annotated, Any, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

from src.core.config import config

logger = logging.getLogger(__name__)
oauth2_scheme = HTTPBearer()


class JWKSCache:
    """Cache for Clerk's JWKS (JSON Web Key Set) with TTL."""

    def __init__(self, jwks_url: str, ttl_hours: int = 1):
        self.jwks_url = jwks_url
        self.ttl = timedelta(hours=ttl_hours)
        self._keys: Optional[dict[str, Any]] = None
        self._last_fetched: Optional[datetime] = None

    async def get_signing_keys(self) -> dict[str, Any]:
        """Get signing keys from JWKS endpoint with caching."""
        now = datetime.now()

        # Check if cache is still valid
        if self._keys and self._last_fetched:
            if now - self._last_fetched < self.ttl:
                return self._keys

        # Fetch new keys
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.jwks_url)
                response.raise_for_status()
                jwks_data = response.json()

            # Convert JWKS to a dict of keys indexed by kid (key ID)
            keys = {}
            for key in jwks_data.get("keys", []):
                kid = key.get("kid")
                if kid:
                    keys[kid] = key

            self._keys = keys
            self._last_fetched = now
            logger.info(f"Fetched {len(keys)} signing keys from JWKS endpoint")

            return keys

        except Exception as e:
            logger.error(f"Failed to fetch JWKS: {str(e)}")
            # If we have cached keys, return them even if expired
            if self._keys:
                logger.warning("Using expired JWKS cache due to fetch failure")
                return self._keys
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to verify authentication at this time",
            )


# Initialize JWKS cache
jwks_cache = JWKSCache(config.CLERK_JWKS_URL)


async def verify_clerk_token(token: str) -> dict[str, Any]:
    """
    Verify Clerk JWT token and return decoded claims.

    Args:
        token: The JWT token to verify

    Returns:
        Decoded token claims including user ID in 'sub' field

    Raises:
        HTTPException: If token is invalid, expired, or verification fails
    """
    try:
        # First decode without verification to get the header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing key ID",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Get signing keys from cache
        signing_keys = await jwks_cache.get_signing_keys()

        if kid not in signing_keys:
            # Force refresh cache and try again
            jwks_cache._last_fetched = None
            signing_keys = await jwks_cache.get_signing_keys()

            if kid not in signing_keys:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: key not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        # Get the public key for this token
        jwk = signing_keys[kid]

        # Convert JWK to PEM format for PyJWT
        from jwt.algorithms import RSAAlgorithm

        public_key = RSAAlgorithm.from_jwk(jwk)

        # Verify and decode the token
        audiences = config.CLERK_AUDIENCES
        decode_options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_iat": True,
            "verify_iss": bool(config.CLERK_ISSUER),
            "verify_aud": bool(audiences),
        }
        decode_kwargs: dict[str, Any] = {}
        if config.CLERK_ISSUER:
            decode_kwargs["issuer"] = config.CLERK_ISSUER
        if audiences:
            decode_kwargs["audience"] = audiences if len(audiences) > 1 else audiences[0]

        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options=decode_options,
            **decode_kwargs,
        )

        authorized_parties = config.CLERK_AUTHORIZED_PARTY_LIST
        if authorized_parties:
            azp = decoded.get("azp")
            if azp not in authorized_parties:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: unauthorized party",
                    headers={"WWW-Authenticate": "Bearer"},
                )

        return decoded

    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        logger.warning("Token verification failed: token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    token: Annotated[Any, Depends(oauth2_scheme)],
) -> str:
    """
    FastAPI dependency to get current user's Clerk ID from JWT token.

    Args:
        token: Bearer token from Authorization header

    Returns:
        Clerk user ID (from 'sub' claim)

    Raises:
        HTTPException: If authentication fails
    """
    decoded_token = await verify_clerk_token(token.credentials)

    # Extract user ID from 'sub' claim
    clerk_id = decoded_token.get("sub")

    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return clerk_id
